import { defineStore } from 'pinia'
import { computed, ref, shallowReactive, toValue, watch } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { api } from '@/lib/api'
import {
  busLegProgress,
  etaToHalte,
  getEtaQuality,
  haversineMeters,
  isStale,
} from '@/lib/format'
import type { BrtBus, BrtCity, BrtCorridor, BrtHalte } from '@/types/brt'
import { useCityStore } from './city'

/** Arrival row used by the halte detail card and the trip planner's
 *  per-step disclosure. Pre-computed in the store so components are
 *  pure renderers. */
export interface IncomingBus {
  bus: BrtBus
  etaMin: number | null
  distM: number | null
  atStop: boolean
  fresh: boolean
  quality: 'good' | 'warn' | 'stale'
  corridorColor: string
  /** Wall-clock arrival HH:MM. Null when ETA is unknown. */
  arrivalAt: string | null
}

/** Upcoming-stop row used by the bus detail card. */
export interface UpcomingStop {
  sh_id: string
  sh_name: string
  etaMin: number | null
  distM: number | null
  arrivalAt: string | null
  /** Bus is currently dwelling at this halte (GPS within AT_STOP_RADIUS_M).
   *  Used by BusDetailCard to keep the halte visible with an "AT STOP"
   *  badge during the dwell window instead of dropping it the moment
   *  upstream's old_shel_t advances. */
  atStop: boolean
}

const AT_STOP_RADIUS_M = 80
const FALLBACK_RIDE_SPEED_KMH = 22

function pad(n: number): string { return n < 10 ? `0${n}` : String(n) }
function wallClockFor(etaMin: number): string {
  const d = new Date(Date.now() + Math.max(0, etaMin) * 60_000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const useBrtStore = defineStore('brt', () => {
  const city = useCityStore()

  const cities = ref<BrtCity[]>([])
  const corridors = ref<BrtCorridor[]>([])
  const halte = ref<BrtHalte[]>([])
  // Shallow on purpose — BrtBus payloads churn at 1 Hz and we always
  // replace entries wholesale in `upsertBus` (no nested mutation).
  // Deep reactivity would Proxy-wrap ~20 fields × 20 buses = 400+ deps
  // every tick. shallowReactive tracks Map.set/delete but skips the
  // per-field descent, while watchers on the Map (`{ deep: true }`)
  // still fire on every upsert.
  const buses = shallowReactive<Map<string, BrtBus>>(new Map())

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

  /** Find the closest halte in the bulk feed to a lat/lng point.
   *  Used by the trip planner's map-tap + GPS handlers so the user's
   *  origin always resolves to a real halte (transit makes no sense
   *  otherwise). Returns null only if the bulk feed is empty. */
  function nearestHalte(lat: number, lng: number): BrtHalte | null {
    let best: { h: BrtHalte; d: number } | null = null
    for (const h of halte.value) {
      const hLat = parseFloat(h.sh_lat)
      const hLng = parseFloat(h.sh_lng)
      if (!Number.isFinite(hLat) || !Number.isFinite(hLng)) continue
      const d = haversineMeters({ lat, lng }, { lat: hLat, lng: hLng })
      if (!best || d < best.d) best = { h, d }
    }
    return best?.h ?? null
  }

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
    const cached = halteByLeg.value.get(legKey(kor, toward, origin))
    if (cached) return cached
    // Bulk-feed fallback: per-leg endpoint hasn't been hit for this
    // (kor, toward, origin) yet (e.g. user opened the trip planner
    // without focusing a corridor first). Filtering brt.halte by the
    // same triple is good enough for graph construction — bulk has
    // sequential order and only loses the K1-reverse terminals plus
    // the entire K2A reverse, which transit planning can tolerate.
    return halte.value.filter(
      (h) => h.kor === kor && h.toward === toward && h.origin === origin,
    )
  }

  watch(
    () => city.pref,
    () => {
      halteByLeg.value.clear()
      inflightHalteLeg.clear()
    },
  )

  // ──────────────────────────────────────────────────────────────
  // Derived selectors. Each takes a MaybeRefOrGetter input so the
  // caller can pass a plain value, a ref, or a getter; we normalise
  // with toValue() inside the computed so Vue tracks reactivity
  // correctly regardless of how the input is supplied. Components
  // call these methods to get a ComputedRef they can render
  // directly — no need for the component to own the derivation.
  // ──────────────────────────────────────────────────────────────

  /** Buses currently approaching `halte` (matched by sh_name or
   *  in_koridor, scoped to allowed corridors). Replaces the per-
   *  component arrivals computeds in HalteDetailCard and the trip
   *  planner's per-step disclosure. */
  function incomingBusesForHalte(
    halteRef: MaybeRefOrGetter<BrtHalte | null | undefined>,
  ): ComputedRef<IncomingBus[]> {
    return computed(() => {
      const target = toValue(halteRef)
      if (!target) return []

      // All sh_ids that share this physical stop (same name across
      // corridors — covers the multi-row case where a transfer
      // point is listed once per kor).
      const shIds = new Set(
        halte.value
          .filter((h) => h.sh_name === target.sh_name)
          .map((h) => h.sh_id),
      )

      const allowedKors = new Set<string>([target.kor])
      if (target.in_koridor) {
        for (const k of target.in_koridor.split('|').filter(Boolean)) {
          allowedKors.add(k)
        }
      }

      const lat = parseFloat(target.sh_lat)
      const lng = parseFloat(target.sh_lng)
      const halteCoord = Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : null

      const out: IncomingBus[] = []
      const seen = new Set<string>()
      for (const bus of buses.values()) {
        if (!allowedKors.has(bus.kor)) continue

        // Resolve heading via leg progress instead of trusting
        // bus.new_shel_t alone — terminus halte get pinned to that
        // field forever once a bus parks there. Fall back to the
        // legacy new_shel_t check while per-leg data is still
        // loading (busLegProgress needs a non-empty leg array).
        let headingHere = false
        const corridor = corridorByKor.value.get(bus.kor)
        if (corridor) {
          const originName = bus.toward === corridor.toward ? corridor.origin : corridor.toward
          const leg = getHalteForLeg(bus.kor, bus.toward, originName)
          if (leg.length) {
            const progressIdx = busLegProgress(bus, leg)
            for (let i = progressIdx; i < leg.length; i++) {
              if (shIds.has(leg[i].sh_id)) { headingHere = true; break }
            }
          }
        }
        if (!headingHere && bus.new_shel_t && shIds.has(bus.new_shel_t)) {
          headingHere = true
        }

        let nearby = false
        if (
          halteCoord
          && Number.isFinite(bus.lat)
          && Number.isFinite(bus.lng)
        ) {
          const d = haversineMeters(
            halteCoord,
            { lat: Number(bus.lat), lng: Number(bus.lng) },
          )
          nearby = d <= AT_STOP_RADIUS_M
        }
        if (!headingHere && !nearby) continue

        const key = bus.imei || bus.id
        if (seen.has(key)) continue
        seen.add(key)

        // dist_shel from upstream applies to new_shel_t, not
        // necessarily to this halte — force haversine fallback.
        let etaMin: number | null = null
        let distM: number | null = null
        if (
          headingHere && !nearby
          && halteCoord
          && Number.isFinite(bus.lat) && Number.isFinite(bus.lng)
        ) {
          const eta = etaToHalte(
            { lat: Number(bus.lat), lng: Number(bus.lng), speed: bus.speed, dist_shel: null },
            target,
          )
          distM = eta?.distM ?? null
          etaMin = eta?.etaMin ?? null
        }

        out.push({
          bus,
          etaMin: nearby ? 0 : etaMin,
          distM: nearby ? 0 : distM,
          atStop: nearby,
          fresh: !isStale(bus),
          quality: getEtaQuality(bus),
          corridorColor: colorForKor.value(bus.kor) || '#0EA5E9',
          arrivalAt: !nearby && etaMin != null ? wallClockFor(etaMin) : null,
        })
      }

      out.sort((a, b) => {
        if (a.atStop !== b.atStop) return a.atStop ? -1 : 1
        if (a.etaMin == null && b.etaMin == null) return 0
        if (a.etaMin == null) return 1
        if (b.etaMin == null) return -1
        return a.etaMin - b.etaMin
      })
      return out
    })
  }

  /** Upcoming halte for the given bus along its current leg, with
   *  ETAs. Replaces BusDetailCard.upcomingStops. */
  function upcomingStopsForBus(
    busRef: MaybeRefOrGetter<BrtBus | null | undefined>,
  ): ComputedRef<UpcomingStop[]> {
    return computed(() => {
      const bus = toValue(busRef)
      if (!bus?.kor) return []
      const corridor = corridorByKor.value.get(bus.kor)
      if (!corridor) return []

      const originName = bus.toward === corridor.toward ? corridor.origin : corridor.toward
      const orderedHalte = getHalteForLeg(bus.kor, bus.toward, originName)
      if (!orderedHalte.length) return []

      // GPS-based progress so stale new_shel_t doesn't include
      // halte the bus already passed (Wisma Donggala terminus case).
      const startIdx = busLegProgress(bus, orderedHalte)
      let displayStart = startIdx

      // Walk back one to keep the just-departed halte visible during
      // the dwell window — but ONLY when the bus is actually dwelling
      // (slow + within radius). If the bus is already moving away from
      // the halte, drop it immediately so the user doesn't see a halte
      // labelled "AT STOP" while the bus is clearly leaving it on the map.
      const speed = Number.isFinite(bus.speed) ? Number(bus.speed) : 0
      if (
        startIdx > 0
        && speed < 5
        && Number.isFinite(bus.lat)
        && Number.isFinite(bus.lng)
      ) {
        const prev = orderedHalte[startIdx - 1]
        const pLat = parseFloat(prev.sh_lat)
        const pLng = parseFloat(prev.sh_lng)
        if (Number.isFinite(pLat) && Number.isFinite(pLng)) {
          const d = haversineMeters(
            { lat: bus.lat as number, lng: bus.lng as number },
            { lat: pLat, lng: pLng },
          )
          if (d <= AT_STOP_RADIUS_M) displayStart = startIdx - 1
        }
      }

      const slice = orderedHalte.slice(displayStart)

      return slice.map((h, i): UpcomingStop => {
        let distM: number | null = null
        let etaMin: number | null = null

        if (i === 0 && h.sh_id === bus.new_shel_t) {
          // First upcoming halte AND it matches the upstream-reported
          // next-stop — trust dist_shel if present.
          const eta = etaToHalte(bus, h)
          distM = eta?.distM ?? null
          etaMin = eta?.etaMin ?? null
        } else if (Number.isFinite(bus.lat) && Number.isFinite(bus.lng)) {
          const hLat = parseFloat(h.sh_lat)
          const hLng = parseFloat(h.sh_lng)
          if (Number.isFinite(hLat) && Number.isFinite(hLng)) {
            distM = haversineMeters(
              { lat: bus.lat as number, lng: bus.lng as number },
              { lat: hLat, lng: hLng },
            )
            const speed = Number.isFinite(bus.speed) && Number(bus.speed) >= 5
              ? Number(bus.speed)
              : FALLBACK_RIDE_SPEED_KMH
            etaMin = (distM / 1000) / speed * 60
          }
        }

        // Mark "at stop" only when bus is both close AND slow — a bus
        // passing through within 80m at full speed isn't dwelling.
        const atStop = distM != null && distM <= AT_STOP_RADIUS_M && speed < 5

        return {
          sh_id: h.sh_id,
          sh_name: h.sh_name,
          etaMin: atStop ? 0 : etaMin,
          distM,
          arrivalAt: atStop ? null : (etaMin != null ? wallClockFor(etaMin) : null),
          atStop,
        }
      })
    })
  }

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
    nearestHalte,
    loadCities,
    loadRoutes,
    upsertBus,
    clearBuses,
    halteByLeg,
    ensureHalteForLeg,
    getHalteForLeg,
    incomingBusesForHalte,
    upcomingStopsForBus,
  }
})
