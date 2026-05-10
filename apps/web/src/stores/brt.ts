import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { api } from '@/lib/api'
import type { BrtBus, BrtCity, BrtCorridor, BrtHalte } from '@/types/brt'

export const useBrtStore = defineStore('brt', () => {
  const cities = ref<BrtCity[]>([])
  const corridors = ref<BrtCorridor[]>([])
  const halte = ref<BrtHalte[]>([])
  const buses = reactive<Map<string, BrtBus>>(new Map())

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
    buses.set(b.imei || b.id, { ...buses.get(b.imei || b.id), ...b })
  }

  function clearBuses() {
    buses.clear()
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
    loadCities,
    loadRoutes,
    upsertBus,
    clearBuses,
  }
})
