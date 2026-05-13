import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { api } from '@/lib/api'
import { haversineMeters } from '@/lib/format'
import type { BrtBus, BrtCity, BrtCorridor, BrtHalte } from '@/types/brt'
import { useCityStore } from './city'

export const useBrtStore = defineStore('brt', () => {
  const city = useCityStore()

  const cities = ref<BrtCity[]>([])
  const corridors = ref<BrtCorridor[]>([])
  const halte = ref<BrtHalte[]>([])
  const buses = reactive<Map<string, BrtBus>>(new Map())

  // Per-leg halte cache. Key = `${kor}|${toward}|${origin}`.
  // Populated lazily when focus/bus detail asks for a specific leg —
  // the bulk /halte feed is missing reverse-direction stops for K2A and
  // the terminal stops on K1 reverse, so we go via the per-leg endpoint
  // (upstream getRouteCorridor) which is authoritative.
  const halteByLeg = ref(new Map<string, BrtHalte[]>())
  const inflightHalteLeg = new Map<string, Promise<BrtHalte[]>>()

  const loading = ref(false)
  const error = ref<string | null>(null)

  const corridorByKor = computed(() => {
    const m = new Map<string, BrtCorridor>()
    for (const c of corridors.value) m.set(c.kor, c)
    return m
  })

  const colorForKor = computed(() => (kor: string) => corridorByKor.value.get(kor)?.color ?? '#0EA5E9')

  const cityByPref = computed(() => {
    const m = new Map<string, BrtCity>()
    for (const c of cities.value) if (c.pref) m.set(c.pref, c)
    return m
  })

  async function loadCities() {
    try {
      const list = await api.cities()
      cities.value = asArray<BrtCity>(list)
    } catch (e) {
      // Cities meta is non-critical — silently keep whatever we had.
      void e
    }
  }

  async function loadRoutes(pref: string) {
    loading.value = true
    error.value = null
    try {
      const [c, h] = await Promise.all([api.corridors(pref), api.halte(pref)])
      corridors.value = asArray(c)
      halte.value = asArray(h)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      corridors.value = []
      halte.value = []
    } finally {
      loading.value = false
    }
  }

  /** Defensive: tolerate either a raw array or a {data: [...]} wrapper. */
  function asArray<T>(v: unknown): T[] {
    if (Array.isArray(v)) return v as T[]
    if (v && typeof v === 'object' && Array.isArray((v as { data?: unknown }).data)) {
      return (v as { data: T[] }).data
    }
    return []
  }

  function upsertBus(b: BrtBus) {
    if (b.lat == null || b.lng == null) return
    const key = b.imei || b.id
    const prev = buses.get(key)
    const now = Date.now()

    // _lastMovedAt only ticks forward when the bus moved beyond GPS
    // jitter (~15 m), so a parked bus's timer keeps counting even
    // though noise nudges its lat/lng by a few metres each ping.
    let lastMovedAt = prev?._lastMovedAt ?? now
    if (
      !prev ||
      prev.lat == null ||
      prev.lng == null ||
      haversineMeters(
        { lat: prev.lat, lng: prev.lng },
        { lat: b.lat, lng: b.lng },
      ) > 15
    ) {
      lastMovedAt = now
    }

    // Track how long the bus has been reporting exactly 0 km/h — once
    // that streak crosses ~60 s the bus is treated as stalled even if
    // the data feed is otherwise healthy.
    const speed = Number.isFinite(b.speed) ? Number(b.speed) : 0
    let zeroSpeedSince: number | null = prev?._zeroSpeedSince ?? null
    if (speed > 0) {
      zeroSpeedSince = null
    } else if (zeroSpeedSince === null) {
      zeroSpeedSince = now
    }

    buses.set(key, {
      ...prev,
      ...b,
      _receivedAt: now,
      _lastMovedAt: lastMovedAt,
      _zeroSpeedSince: zeroSpeedSince,
    })
  }

  function clearBuses() {
    buses.clear()
  }

  function legKey(kor: string, toward: string, origin: string): string {
    return `${kor}|${toward}|${origin}`
  }

  async function ensureHalteForLeg(
    kor: string,
    toward: string,
    origin: string,
  ): Promise<BrtHalte[]> {
    const key = legKey(kor, toward, origin)
    const cached = halteByLeg.value.get(key)
    if (cached) return cached
    const inflight = inflightHalteLeg.get(key)
    if (inflight) return inflight

    const p = api
      .halteByCorridor(city.pref, kor, toward, origin)
      .then((list) => {
        halteByLeg.value.set(key, list)
        inflightHalteLeg.delete(key)
        return list
      })
      .catch((err) => {
        inflightHalteLeg.delete(key)
        throw err
      })
    inflightHalteLeg.set(key, p)
    return p
  }

  function getHalteForLeg(kor: string, toward: string, origin: string): BrtHalte[] {
    return halteByLeg.value.get(legKey(kor, toward, origin)) ?? []
  }

  watch(
    () => city.pref,
    () => {
      halteByLeg.value.clear()
      inflightHalteLeg.clear()
    },
  )

  return {
    cities,
    corridors,
    halte,
    buses,
    loading,
    error,
    corridorByKor,
    colorForKor,
    cityByPref,
    loadCities,
    loadRoutes,
    upsertBus,
    clearBuses,
    halteByLeg,
    ensureHalteForLeg,
    getHalteForLeg,
  }
})
