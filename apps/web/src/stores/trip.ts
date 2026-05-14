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
  /** When non-null, the next map click is consumed by the trip
   *  planner — used to drop an origin/destination pin from the map.
   *  MapView watches this and wires up a one-shot click handler. */
  const tapMode = ref<'origin' | 'dest' | null>(null)
  /** Transient "zoom to this point" trigger. TripDetailPanel sets it
   *  when the user taps a step row; MapView watches and flyTo's. */
  const focusedStop = ref<LatLng | null>(null)

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
   *  missing reverse-direction halte for some corridors (K2A has 0
   *  reverse rows in bulk; per-leg returns 19). Prefetch all legs in
   *  parallel before building so the worker gets the full picture. */
  async function buildGraph() {
    graphReady.value = false
    // Prefetch per-leg in parallel — covers bulk feed gaps.
    const prefetches: Promise<unknown>[] = []
    for (const c of brt.corridors) {
      prefetches.push(brt.ensureHalteForLeg(c.kor, c.toward, c.origin).catch(() => {}))
      prefetches.push(brt.ensureHalteForLeg(c.kor, c.origin, c.toward).catch(() => {}))
    }
    await Promise.all(prefetches)

    const halteByLeg: import('@/types/brt').BrtHalte[][] = []
    for (const c of brt.corridors) {
      const a = brt.getHalteForLeg(c.kor, c.toward, c.origin)
      const b = brt.getHalteForLeg(c.kor, c.origin, c.toward)
      if (a.length) halteByLeg.push(a)
      if (b.length) halteByLeg.push(b)
    }
    try {
      // Strip Vue reactive Proxies before crossing the worker boundary.
      // postMessage uses structured clone, which can't clone Proxies.
      await call<{ type: 'graphReady'; nodeCount: number }>({
        type: 'buildGraph',
        corridors: JSON.parse(JSON.stringify(brt.corridors)),
        halteByLeg: JSON.parse(JSON.stringify(halteByLeg)),
        allHalte: JSON.parse(JSON.stringify(brt.halte)),
      })
      graphReady.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  /** Bump every time recompute starts; lets late-arriving worker
   *  responses know they're stale and bail. Prevents an earlier
   *  in-flight plan from overwriting a newer one. */
  let recomputeSeq = 0

  async function recompute() {
    // Clear stale plans immediately so the UI doesn't keep showing
    // the previous destination's routes while we compute.
    plans.value = []
    selectedPlanIdx.value = null
    if (!origin.value || !destination.value) {
      loading.value = false
      return
    }
    const seq = ++recomputeSeq
    if (!graphReady.value) await buildGraph()
    if (seq !== recomputeSeq) return // a newer recompute superseded us
    loading.value = true
    error.value = null
    try {
      // Strip reactive Proxies before postMessage — structured clone
      // can't handle them. origin/destination.point is a Vue reactive
      // {lat, lng} so even the inner object needs unwrapping.
      const o = origin.value.point
      const d = destination.value.point
      // When the destination is a specific halte, restrict the final
      // ride to a corridor that actually serves it (in_koridor split
      // + the halte's own kor). Without this, Dijkstra can drop the
      // user off on a different corridor 300 m away — e.g. ending on
      // K1 when the picked halte isn't on K1 at all.
      let destKors: string[] | null = null
      if (destination.value.sh_id) {
        const h = brt.halte.find((x) => x.sh_id === destination.value!.sh_id)
        if (h) {
          const kors = new Set<string>()
          kors.add(h.kor)
          if (h.in_koridor) {
            for (const k of h.in_koridor.split('|').filter(Boolean)) kors.add(k)
          }
          destKors = [...kors]
        }
      }
      const resp = await call<{ type: 'plan'; paths: PlanResult[] }>({
        type: 'plan',
        origin: { lat: o.lat, lng: o.lng },
        dest: { lat: d.lat, lng: d.lng },
        k: 5,
        destKors,
      })
      if (seq !== recomputeSeq) return // newer recompute won, ignore
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
  function setTapMode(m: 'origin' | 'dest' | null) { tapMode.value = m }
  function focusStop(p: LatLng | null) { focusedStop.value = p }
  function swap() {
    const o = origin.value
    const d = destination.value
    // Clear the existing plans up-front so the stale "PGM as
    // destination" results don't linger on screen while the new
    // direction is recomputing. Vue batches the two ref writes below
    // into a single watcher tick, so without this nudge the
    // debounced recompute fires once and the user can briefly see
    // (or, on a fast machine, keeps seeing) the pre-swap plans.
    plans.value = []
    selectedPlanIdx.value = null
    origin.value = d
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

  // If per-leg halte data lands after the graph was built from the
  // bulk fallback, mark the graph dirty so the next plan request
  // rebuilds with higher-quality data.
  watch(
    () => [...brt.halteByLeg.keys()].sort().join('|'),
    () => { graphReady.value = false },
  )

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
    tapMode,
    focusedStop,
    setOrigin,
    setDestination,
    setTapMode,
    focusStop,
    swap,
    selectPlan,
    clear,
    buildGraph,
    recompute,
  }
})
