import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { api } from '@/lib/api'
import type { BrtBus, BrtCorridor, BrtHalte } from '@/types/brt'

export const useBrtStore = defineStore('brt', () => {
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

  async function loadRoutes(pref: string) {
    loading.value = true
    error.value = null
    try {
      const [c, h] = await Promise.all([api.corridors(pref), api.halte(pref)])
      corridors.value = c
      halte.value = h
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  function upsertBus(b: BrtBus) {
    if (b.lat == null || b.lng == null) return
    buses.set(b.imei || b.id, { ...buses.get(b.imei || b.id), ...b })
  }

  function clearBuses() {
    buses.clear()
  }

  return {
    corridors,
    halte,
    buses,
    loading,
    error,
    corridorByKor,
    colorForKor,
    loadRoutes,
    upsertBus,
    clearBuses,
  }
})
