/**
 * Trip planner store — owns the Web Worker handle, the user's origin
 * and destination, the active plan result, and the selected plan
 * index. UI components subscribe via storeToRefs.
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import TripPlannerWorker from '@/workers/tripPlanner.worker?worker'
import type { LatLng, PlanResult } from '@/lib/tripPlanner'
import { useBrtStore } from './brt'
import { useCityStore } from './city'

export type EndpointKind = 'gps' | 'halte' | 'pin'

export interface Endpoint {
  kind: EndpointKind
  /** Human-readable label rendered in the input chip. */
  label: string
  point: LatLng
  /** Halte id if kind === 'halte'; otherwise null. */
  sh_id?: string | null
}

export const useTripStore = defineStore('trip', () => {
  const brt = useBrtStore()
  const city = useCityStore()

  const origin = ref<Endpoint | null>(null)
  const destination = ref<Endpoint | null>(null)
  const plans = ref<PlanResult[]>([])
  const selectedPlanIdx = ref<number | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const graphReady = ref(false)

  let worker: Worker | null = null
  let nextId = 1
  const inflight = new Map<number, (data: unknown) => void>()

  function ensureWorker(): Worker {
    if (worker) return worker
    worker = new TripPlannerWorker()
    worker.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { id: number; type: string }
      const cb = inflight.get(data.id)
      if (cb) {
        inflight.delete(data.id)
        cb(data)
      }
    }
    return worker
  }

  function call<T>(payload: object): Promise<T> {
    const w = ensureWorker()
    const id = nextId++
    return new Promise<T>((resolve, reject) => {
      inflight.set(id, (resp: unknown) => {
        const r = resp as { type: string; message?: string }
        if (r.type === 'error') reject(new Error(r.message ?? 'worker error'))
        else resolve(resp as T)
      })
      w.postMessage({ id, ...payload })
    })
  }

  /** Build (or rebuild) the graph from current brt store state. The
   *  per-leg halte lists are the authoritative source — bulk halte is
   *  missing reverse-direction terminals (see beads 6ke). */
  async function buildGraph() {
    const halteByLeg: import('@/types/brt').BrtHalte[][] = []
    for (const c of brt.corridors) {
      const a = brt.getHalteForLeg(c.kor, c.toward, c.origin)
      const b = brt.getHalteForLeg(c.kor, c.origin, c.toward)
      if (a.length) halteByLeg.push(a)
      if (b.length) halteByLeg.push(b)
    }
    graphReady.value = false
    try {
      await call<{ type: 'graphReady'; nodeCount: number }>({
        type: 'buildGraph',
        corridors: brt.corridors,
        halteByLeg,
      })
      graphReady.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function recompute() {
    if (!origin.value || !destination.value) {
      plans.value = []
      selectedPlanIdx.value = null
      return
    }
    if (!graphReady.value) await buildGraph()
    loading.value = true
    error.value = null
    try {
      const resp = await call<{ type: 'plan'; paths: PlanResult[] }>({
        type: 'plan',
        origin: origin.value.point,
        dest: destination.value.point,
        k: 5,
      })
      plans.value = resp.paths
      // Don't auto-select — the user picks from the result list first
      // (matches TJ Transjakarta's flow: list → tap → detail).
      selectedPlanIdx.value = null
    } catch (e) {
      plans.value = []
      selectedPlanIdx.value = null
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  function setOrigin(e: Endpoint | null) { origin.value = e }
  function setDestination(e: Endpoint | null) { destination.value = e }
  function swap() {
    const o = origin.value
    origin.value = destination.value
    destination.value = o
  }
  function selectPlan(idx: number | null) { selectedPlanIdx.value = idx }
  function clear() {
    origin.value = null
    destination.value = null
    plans.value = []
    selectedPlanIdx.value = null
    error.value = null
  }

  const selectedPlan = computed(() =>
    selectedPlanIdx.value != null ? (plans.value[selectedPlanIdx.value] ?? null) : null,
  )

  // Rebuild graph when the city changes (different corridors / halte).
  watch(() => city.pref, () => {
    graphReady.value = false
    clear()
  })

  // Recompute plans when endpoints change. Debounced via a tiny timer.
  let debounceTimer: number | undefined
  watch([origin, destination], () => {
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => { recompute() }, 250)
  })

  return {
    origin,
    destination,
    plans,
    selectedPlan,
    selectedPlanIdx,
    loading,
    error,
    graphReady,
    setOrigin,
    setDestination,
    swap,
    selectPlan,
    clear,
    buildGraph,
    recompute,
  }
})
