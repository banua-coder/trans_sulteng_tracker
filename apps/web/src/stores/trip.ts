/**
 * Trip planner store — owns the Web Worker handle, the user's origin
 * and destination, the active plan result, and the selected plan
 * index. UI components subscribe via storeToRefs.
 */
import { defineStore } from 'pinia'
import { computed, ref, toValue, watch } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import TripPlannerWorker from '@/workers/tripPlanner.worker?worker'
import {
  busLegProgress,
  etaToHalte,
  getEtaQuality,
  haversineMeters,
  isStale,
} from '@/lib/format'
import type { LatLng, PlanResult, PlanStep } from '@/lib/tripPlanner'
import type { BrtHalte } from '@/types/brt'
import { useBrtStore, type IncomingBus } from './brt'
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
    // A crashed worker or failed chunk load would otherwise leave every
    // pending call hanging and the spinner on forever. Reject them all
    // and drop the worker so the next call starts a fresh one.
    const fail = (message: string) => {
      const pending = [...inflight.values()]
      inflight.clear()
      worker?.terminate()
      worker = null
      graphReady.value = false
      for (const cb of pending) cb({ type: 'error', message })
    }
    worker.onerror = (ev) => fail(ev.message || 'planner worker failed')
    worker.onmessageerror = () => fail('planner worker message error')
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
  let foreignLoading: Promise<void> | null = null
  function ensureForeign(): Promise<void> {
    if (brt.foreignCorridors.length) return Promise.resolve()
    foreignLoading ??= brt
      .loadForeign(city.pref === '12' ? '11' : '12')
      .finally(() => { foreignLoading = null })
    return foreignLoading
  }

  async function buildGraph() {
    graphReady.value = false
    // The other city joins the graph so a trip can cross the border
    // (Wisma Donggala ↔ Halte Unisa is a 96 m walk).
    await ensureForeign()
    const corridors = [...brt.corridors, ...brt.foreignCorridors]
    // Prefetch per-leg in parallel — covers bulk feed gaps.
    const prefetches: Promise<unknown>[] = []
    for (const c of corridors) {
      prefetches.push(brt.ensureHalteForLeg(c.kor, c.toward, c.origin).catch(() => {}))
      prefetches.push(brt.ensureHalteForLeg(c.kor, c.origin, c.toward).catch(() => {}))
    }
    await Promise.all(prefetches)

    const halteByLeg: import('@/types/brt').BrtHalte[][] = []
    for (const c of corridors) {
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
        corridors: JSON.parse(JSON.stringify(corridors)),
        halteByLeg: JSON.parse(JSON.stringify(halteByLeg)),
        allHalte: JSON.parse(JSON.stringify(brt.planHalte)),
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
    // Show the spinner for the whole job, including the graph build
    // and its network prefetch, so "no route" never flashes first.
    loading.value = true
    error.value = null
    if (!graphReady.value) await buildGraph()
    if (seq !== recomputeSeq) return // a newer recompute superseded us
    if (!graphReady.value) {
      loading.value = false
      return // buildGraph already recorded the error
    }
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
      // A stop appears once per corridor and direction; union them all
      // so picking the K1 row of a stop that K4A also serves still
      // allows K4A to end the trip.
      let destKors: string[] | null = null
      if (destination.value.sh_id) {
        const h = brt.planHalte.find((x) => x.sh_id === destination.value!.sh_id)
        if (h) {
          const kors = new Set<string>()
          for (const row of brt.planHalte) {
            if (row.sh_name !== h.sh_name) continue
            kors.add(row.kor)
            for (const k of (row.in_koridor ?? '').split('|').filter(Boolean)) kors.add(k)
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
        originPinned: origin.value.kind === 'halte',
      })
      if (seq !== recomputeSeq) return // newer recompute won, ignore
      plans.value = withLiveWait(resp.paths)
      // Don't auto-select — the user picks from the result list first
      // (matches TJ Transjakarta's flow: list → tap → detail).
      selectedPlanIdx.value = null
    } catch (e) {
      plans.value = []
      selectedPlanIdx.value = null
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      // A superseded call must not switch the spinner off under the
      // newer one that is still running.
      if (seq === recomputeSeq) loading.value = false
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

  // ──────────────────────────────────────────────────────────────
  // Derived selectors for the active plan. These used to live in
  // MapView / TripDetailPanel; consolidating them here lets the UI
  // be pure presentation and means store consumers all share the
  // same memoised results.
  // ──────────────────────────────────────────────────────────────

  const MATCH_RADIUS_M = 200

  function coordForName(name: string): { lat: number; lng: number } | null {
    for (const h of brt.planHalte) {
      if (h.sh_name !== name) continue
      const lat = parseFloat(h.sh_lat)
      const lng = parseFloat(h.sh_lng)
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
    }
    return null
  }

  /** Corridor codes the selected plan rides through (ride steps only;
   *  walks + transfers don't consume corridor visibility). */
  const planKors = computed<Set<string> | null>(() => {
    const plan = selectedPlan.value
    if (!plan) return null
    const set = new Set<string>()
    for (const step of plan.steps) {
      if (step.kind === 'ride' && step.kor) set.add(step.kor)
    }
    return set
  })

  /** sh_name set covering every halte the bus rolls through on the
   *  plan's actual route. MapView dims out anything not in this set. */
  const planHalteNames = computed<Set<string> | null>(() => {
    const plan = selectedPlan.value
    if (!plan) return null
    const names = new Set<string>()
    for (const step of plan.steps) {
      if (step.kind !== 'ride' || !step.kor) continue
      const c = brt.planCorridorByKor.get(step.kor)
      if (!c) continue
      const legA = brt.getHalteForLeg(step.kor, c.toward, c.origin)
      const legB = brt.getHalteForLeg(step.kor, c.origin, c.toward)
      const collectSlice = (leg: BrtHalte[]): boolean => {
        const fromIdx = leg.findIndex((h) => h.sh_name === step.fromName)
        const toIdx = leg.findIndex((h) => h.sh_name === step.toName)
        if (fromIdx < 0 || toIdx < 0 || fromIdx >= toIdx) return false
        for (let i = fromIdx; i <= toIdx; i++) names.add(leg[i].sh_name)
        return true
      }
      if (!collectSlice(legA)) collectSlice(legB)
      // Belt-and-suspenders: include the step endpoints even when the
      // slice search above missed (transfer-point name drift).
      names.add(step.fromName)
      names.add(step.toName)
    }
    return names
  })

  /** Bus IDs (imei|id) the user can catch for the active plan. A bus
   *  qualifies when it sits on a plan ride's corridor and its
   *  busLegProgress hasn't passed the step's boarding halte yet —
   *  including reverse-direction buses inbound to a terminus that
   *  will turn around and serve the user. Same rule the
   *  TripDetailPanel disclosure uses, so map dots and the panel
   *  rows stay in sync. */
  const planRideableBusIds = computed<Set<string> | null>(() => {
    const plan = selectedPlan.value
    if (!plan) return null

    const boardingsByKor = new Map<string, Array<{ lat: number; lng: number }>>()
    for (const step of plan.steps) {
      if (step.kind !== 'ride' || !step.kor) continue
      const coord = coordForName(step.fromName)
      if (!coord) continue
      const arr = boardingsByKor.get(step.kor) ?? []
      arr.push(coord)
      boardingsByKor.set(step.kor, arr)
    }
    if (!boardingsByKor.size) return new Set()

    const rideable = new Set<string>()
    for (const bus of brt.buses.values()) {
      const boardings = boardingsByKor.get(bus.kor)
      if (!boardings?.length) continue
      const corridor = brt.corridorByKor.get(bus.kor)
      if (!corridor) continue
      const originName = bus.toward === corridor.toward ? corridor.origin : corridor.toward
      const leg = brt.getHalteForLeg(bus.kor, bus.toward, originName)
      if (!leg.length) continue
      const progressIdx = busLegProgress(bus, leg)
      outer:
      for (let i = progressIdx; i < leg.length; i++) {
        const h = leg[i]
        const lat = parseFloat(h.sh_lat)
        const lng = parseFloat(h.sh_lng)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
        for (const board of boardings) {
          if (haversineMeters(board, { lat, lng }) <= MATCH_RADIUS_M) {
            rideable.add(bus.imei || bus.id)
            break outer
          }
        }
      }
    }
    return rideable
  })

  /** Map of step index → display number for the timeline. Only
   *  numbers ride + walk steps; a transfer row is numbered only when it
   *  moves to a differently named stop. */
  const stepNumbers = computed<Map<number, number>>(() => {
    const out = new Map<number, number>()
    const plan = selectedPlan.value
    if (!plan) return out
    const seen = new Map<string, number>()
    let counter = 1
    for (const step of plan.steps) {
      if (step.kind !== 'ride') continue
      if (!seen.has(step.fromName)) seen.set(step.fromName, counter++)
      if (!seen.has(step.toName)) seen.set(step.toName, counter++)
    }
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i]
      if (step.kind === 'ride') {
        const n = seen.get(step.toName)
        if (n != null) out.set(i, n)
      } else if (step.kind === 'walk') {
        const n = seen.get(step.toName)
        if (n != null) out.set(i, n)
      } else if (step.kind === 'transfer') {
        // Changing to a differently named stop (Wisma Donggala → Halte
        // Unisa): that stop has its own map marker, so number the row.
        const n = seen.get(step.toName)
        if (n != null && n !== seen.get(step.fromName)) out.set(i, n)
      }
    }
    return out
  })

  /** Buses currently approaching the given ride step's boarding
   *  halte. Same shape as brt.incomingBusesForHalte but scoped to a
   *  plan step's `fromName` / `kor`. */
  function incomingFor(step: PlanStep | null | undefined): IncomingBus[] {
    if (!step || step.kind !== 'ride' || !step.kor) return []
    const corridor = brt.planCorridorByKor.get(step.kor)
    if (!corridor) return []

    const boardingShIds = new Set(
      brt.planHalte
        .filter((h) => h.kor === step.kor && h.sh_name === step.fromName)
        .map((h) => h.sh_id),
    )

    let boardingCoord: { lat: number; lng: number } | null = null
    const namedAtKor = brt.planHalte.find(
      (x) => x.kor === step.kor && x.sh_name === step.fromName,
    )
    if (namedAtKor) {
      const lat = parseFloat(namedAtKor.sh_lat)
      const lng = parseFloat(namedAtKor.sh_lng)
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        boardingCoord = { lat, lng }
      }
    }

    const out: IncomingBus[] = []
    const seen = new Set<string>()
    for (const bus of [...brt.buses.values(), ...brt.foreignBuses.values()]) {
      if (bus.kor !== step.kor || bus._offRoute) continue

      let headingHere = false
      const originName = bus.toward === corridor.toward ? corridor.origin : corridor.toward
      const leg = brt.getHalteForLeg(step.kor, bus.toward, originName)
      if (leg.length) {
        const progressIdx = busLegProgress(bus, leg)
        for (let i = progressIdx; i < leg.length; i++) {
          if (leg[i].sh_name === step.fromName) { headingHere = true; break }
        }
      }
      if (!headingHere && bus.new_shel_t && boardingShIds.has(bus.new_shel_t)) {
        headingHere = true
      }

      let nearby = false
      if (
        boardingCoord
        && Number.isFinite(bus.lat) && Number.isFinite(bus.lng)
      ) {
        const d = haversineMeters(
          boardingCoord,
          { lat: Number(bus.lat), lng: Number(bus.lng) },
        )
        nearby = d <= 80
      }
      if (!headingHere && !nearby) continue
      const key = bus.imei || bus.id
      if (seen.has(key)) continue
      seen.add(key)

      let etaMin: number | null = null
      let distM: number | null = null
      if (
        !nearby && boardingCoord
        && Number.isFinite(bus.lat) && Number.isFinite(bus.lng)
      ) {
        const eta = etaToHalte(
          { lat: Number(bus.lat), lng: Number(bus.lng), speed: bus.speed, dist_shel: null },
          { sh_lat: boardingCoord.lat, sh_lng: boardingCoord.lng },
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
        corridorColor: brt.colorForKor(step.kor) || '#0EA5E9',
        arrivalAt: !nearby && etaMin != null
          ? (() => {
              const d = new Date(Date.now() + Math.max(0, etaMin) * 60_000)
              const p = (n: number) => (n < 10 ? `0${n}` : String(n))
              return `${p(d.getHours())}:${p(d.getMinutes())}`
            })()
          : null,
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
  }

  function incomingBusesForStep(
    stepRef: MaybeRefOrGetter<PlanStep | null | undefined>,
  ): ComputedRef<IncomingBus[]> {
    return computed(() => incomingFor(toValue(stepRef)))
  }

  /** Headway guess when no live bus is on its way: buses come about
   *  every 10 minutes, so the average wait is half of that. */
  const FALLBACK_WAIT_MIN = 5

  /** Add the wait for the first bus to each plan, from live positions
   *  where a bus is heading for the boarding stop, then re-rank. The
   *  rider walks to the stop first, so a bus that arrives before them
   *  adds no wait. ponytail: transfers keep the fixed 5 min wait; live
   *  ETAs at the transfer stop are a later step. */
  function withLiveWait(paths: PlanResult[]): PlanResult[] {
    const out = paths.map((plan) => {
      const idx = plan.steps.findIndex((s) => s.kind === 'ride')
      if (idx < 0) return plan
      const walkBefore = plan.steps.slice(0, idx).reduce((n, s) => n + s.durationMin, 0)
      const live = incomingFor(plan.steps[idx]).find((b) => b.fresh && b.etaMin != null)
      const waitMin = live ? Math.max(0, live.etaMin! - walkBefore) : FALLBACK_WAIT_MIN
      const steps = plan.steps.map((s, i) => (i === idx ? { ...s, waitMin, waitLive: !!live } : s))
      return { ...plan, steps, totalMin: plan.totalMin + waitMin }
    })
    return out.sort((a, b) => a.totalMin - b.totalMin)
  }

  // Rebuild graph when the city changes (different corridors / halte).
  // The other city arriving (or failing and retrying) changes the graph.
  watch(() => brt.foreignCorridors.length, () => { graphReady.value = false })

  watch(() => city.pref, () => {
    foreignLoading = null
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
    // Spinner starts now, not 250 ms later when the debounce fires,
    // so the "no route" message cannot show in that gap.
    if (origin.value && destination.value) {
      plans.value = []
      selectedPlanIdx.value = null
      loading.value = true
    }
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
    ensureForeign,
    recompute,
    planKors,
    planHalteNames,
    planRideableBusIds,
    stepNumbers,
    incomingBusesForStep,
  }
})
