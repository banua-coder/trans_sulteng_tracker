/**
 * Trip companion store. Owns the long-lived ride lifecycle:
 *   - Wake lock so the screen doesn't sleep mid-trip
 *   - watchPosition GPS subscription
 *   - State-machine reducer dispatch on each fix
 *   - Per-status target halte resolution so the reducer doesn't
 *     have to know about boarding vs alighting semantics
 *
 * State-machine math is in `lib/ride/reducer.ts` (pure, unit-tested).
 * Side effects (audio cues, persistence, share UI) live in separate
 * composables that watch this store.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import {
  useDocumentVisibility,
  useGeolocation,
  useOnline,
  useStorage,
  useWakeLock,
} from '@vueuse/core'
import type { PlanResult, PlanStep } from '@/lib/tripPlanner'
import { haversineM, speedKmh as computeSpeedKmh, type LatLng, type PositionFix } from '@/lib/geo'
import { initialState, isStaleFix, reduce, type RideState } from '@/lib/ride/reducer'
import { useBrtStore } from './brt'
import { useCityStore } from './city'
import { useTripStore } from './trip'
import { buildTripPaths, type TripPathSegment } from '@/lib/tripPath'

export interface RideSummary {
  city: 'palu' | 'donggala'
  origin: string
  destination: string
  durationMin: number
  walkM: number
  rideM: number
  corridors: { kor: string; color: string }[]
  trace: Array<[number, number]>
  /** Pre-resolved drawable segments — ride corridor slices + walk
   *  chords. Shares the same geometry as the trip preview on the
   *  live map. */
  paths: TripPathSegment[]
  cityLogo: string
  operator: string
  startedAt: number
  endedAt: number
}

const FIX_BUFFER_SIZE = 5
const FEATURE_FLAG_KEY = 'cektrans:rideEnabled'
const SNAPSHOT_KEY = 'cektrans:ride'
const BATTERY_WARNED_KEY = 'cektrans:rideBatteryWarned'
const SNAPSHOT_SCHEMA_VERSION = 1
const RESUME_STALE_MS = 6 * 60 * 60_000     // 6 hours
const TRACE_SAMPLE_MIN_M = 10                // sample to trace when moved ≥10m
const TRACE_MAX_POINTS = 500                 // ~70 min @ 8s cadence

interface RideSnapshot {
  v: number
  status: RideState['status']
  plan: PlanResult | null
  stepIdx: number
  startedAt: number | null
  trace: Array<[number, number]>             // [lat, lng]
}

function emptySnapshot(): RideSnapshot {
  return { v: SNAPSHOT_SCHEMA_VERSION, status: 'idle', plan: null, stepIdx: 0, startedAt: null, trace: [] }
}

export const useRideStore = defineStore('ride', () => {
  const brt = useBrtStore()
  const trip = useTripStore()
  const cityStore = useCityStore()

  // Feature flag — Phases 1-4 ship gated, Phase 5 removes the gate.
  const enabled = useStorage<boolean>(FEATURE_FLAG_KEY, false, localStorage)

  // Battery-warning dismissal — sticky across reloads.
  const batteryWarned = useStorage<boolean>(BATTERY_WARNED_KEY, false, localStorage)

  // Persisted snapshot. mergeDefaults: true keeps old snapshots
  // compatible when we add fields, and the SCHEMA_VERSION gate in
  // resumeFromSnapshot() handles breaking shape changes.
  const snapshot = useStorage<RideSnapshot>(
    SNAPSHOT_KEY, emptySnapshot(), localStorage, { mergeDefaults: true },
  )

  // Reducer-owned state. shallowRef because reduce() returns a new
  // object every call — deep reactivity would be wasted work.
  const state = shallowRef<RideState>(initialState())

  // GPS trace recorded during the ride for the share-card map.
  const trace = ref<Array<[number, number]>>([])

  // Position ring buffer drives the iOS-safe speed derivation.
  const fixBuffer = ref<PositionFix[]>([])

  // Platform glue (VueUse).
  const wake = useWakeLock()
  const visibility = useDocumentVisibility()
  const online = useOnline()
  //   `maximumAge: 0` — never accept a cached fix. `watchPosition`
  //   was returning a stale first read on PWA / fake-GPS scenarios
  //   and the reactive `locatedAt.value = position.timestamp` chain
  //   would then dedupe subsequent updates that came in with the
  //   same timestamp. Fresh reads only.
  const { coords, locatedAt, error: geoError, resume: geoResume, pause: geoPause }
    = useGeolocation({ enableHighAccuracy: true, maximumAge: 0, immediate: false })

  /** Consume a raw geolocation fix and dispatch it into the reducer.
   *  Both `watchPosition` (via VueUse) and the periodic
   *  `getCurrentPosition` poll feed this single entry point so the
   *  ring buffer, trace, and reducer stay consistent. */
  function ingestFix(lat: number, lng: number, ts: number) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    // Drop duplicates. Fake-GPS and paused-then-resumed watchers can
    // re-fire with the same timestamp; without this guard we'd log
    // the same point twice into the trace and waste a reduce().
    const prevTs = state.value.lastFix?.ts ?? 0
    if (ts <= prevTs) return
    const fix: PositionFix = { lat, lng, ts }
    pushFix(fix)
    pushTrace(fix)
    const speedKmh = computeSpeedKmh(fixBuffer.value)
    state.value = reduce(state.value, {
      type: 'gpsTick',
      fix,
      speedKmh,
      target: resolveTickTarget(state.value),
    })
  }

  // Drive the reducer off VueUse coords updates. `locatedAt` ticks
  // once per resolved fix, so we use it as the single trigger.
  watch(locatedAt, (ts) => {
    if (!ts) return
    const c = coords.value
    ingestFix(c.latitude, c.longitude, ts)
  })

  // Belt-and-braces: some browsers (notably iOS PWAs and Android
  // fake-GPS providers) starve `watchPosition` after the first fix.
  // A periodic `getCurrentPosition` guarantees the reducer keeps
  // seeing fresh reads even if the watcher silently stops firing.
  const POLL_INTERVAL_MS = 3_000
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function startPolling() {
    stopPolling()
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return
    pollTimer = setInterval(() => {
      if (state.value.status === 'idle') return
      if (visibility.value !== 'visible') return
      navigator.geolocation.getCurrentPosition(
        (pos) => ingestFix(pos.coords.latitude, pos.coords.longitude, pos.timestamp),
        () => { /* transient poll failures are already surfaced via geoError */ },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5_000 },
      )
    }, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (pollTimer != null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  // GPS trace ring buffer — sampled when the user moved at least
  // TRACE_SAMPLE_MIN_M from the last recorded point. Persisted via
  // the snapshot watch below so a reload survives mid-trip.
  function pushTrace(fix: PositionFix) {
    if (state.value.status === 'idle') return
    const buf = trace.value
    if (buf.length) {
      const last = buf[buf.length - 1]
      const d = haversineM({ lat: last[0], lng: last[1] }, fix)
      if (d < TRACE_SAMPLE_MIN_M) return
    }
    buf.push([fix.lat, fix.lng])
    if (buf.length > TRACE_MAX_POINTS) buf.shift()
  }

  function pushFix(fix: PositionFix) {
    const buf = fixBuffer.value
    buf.push(fix)
    if (buf.length > FIX_BUFFER_SIZE) buf.shift()
  }

  // Per-status target resolution. The reducer is target-agnostic:
  // each gpsTick carries the LatLng the user is heading toward. For
  // ride steps the target changes mid-step (boarding halte while
  // waiting, alighting halte once on bus), so we recompute it here.
  function resolveTickTarget(s: RideState): LatLng | null {
    const step = s.plan?.steps[s.stepIdx]
    if (!step) return null
    if (step.kind === 'ride') {
      if (s.status === 'waiting') return findHalteCoord(step.fromName)
      return findHalteCoord(step.toName)
    }
    // Walk + transfer — target is the step's destination.
    return findHalteCoord(step.toName) ?? endpointCoord(s, step)
  }

  function endpointCoord(s: RideState, step: PlanStep): LatLng | null {
    if (!s.plan) return null
    const isLast = s.stepIdx === s.plan.steps.length - 1
    if (isLast && step.kind === 'walk' && trip.destination) return trip.destination.point
    return null
  }

  function findHalteCoord(name: string): LatLng | null {
    if (!name) return null
    const h = brt.halte.find((row) => row.sh_name === name)
    if (!h) return null
    const lat = parseFloat(h.sh_lat)
    const lng = parseFloat(h.sh_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  }

  // Pause GPS when the tab is hidden; reacquire wake lock when it
  // returns. The system auto-drops the lock on visibility loss.
  watch(visibility, async (v) => {
    if (state.value.status === 'idle') return
    if (v === 'visible') {
      geoResume()
      startPolling()
      if (wake.isSupported.value && !wake.isActive.value) {
        try { await wake.request('screen') } catch { /* user denied or unsupported */ }
      }
    } else {
      geoPause()
      stopPolling()
    }
  })

  /** Fire a one-shot getCurrentPosition to force the permission
   *  prompt on install/first-run. Some PWAs never show a permission
   *  entry until getCurrentPosition (not watchPosition) is called
   *  in response to a user gesture. Result is fed into the reducer
   *  same as a poll tick. */
  function primePermission() {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) => ingestFix(pos.coords.latitude, pos.coords.longitude, pos.timestamp),
      () => { /* geoError already tracks the reason */ },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 8_000 },
    )
  }

  async function start(plan: PlanResult): Promise<void> {
    if (!enabled.value) return
    fixBuffer.value = []
    trace.value = []
    state.value = reduce(state.value, { type: 'start', plan, at: Date.now() })
    primePermission()
    geoResume()
    startPolling()
    if (wake.isSupported.value) {
      try { await wake.request('screen') } catch { /* ignore */ }
    }
  }

  async function stop(): Promise<void> {
    state.value = reduce(state.value, { type: 'stop', at: Date.now() })
    geoPause()
    stopPolling()
    if (wake.isActive.value) {
      try { await wake.release() } catch { /* ignore */ }
    }
    fixBuffer.value = []
    trace.value = []
    snapshot.value = emptySnapshot()
  }

  /** Restore a previously persisted ride. Caller must ensure the
   *  snapshot has passed `resumeIsAvailable()` checks. */
  async function resumeFromSnapshot(): Promise<void> {
    const snap = snapshot.value
    if (!snap || !snap.plan) return
    state.value = {
      ...initialState(),
      status: snap.status,
      plan: snap.plan,
      stepIdx: snap.stepIdx,
      startedAt: snap.startedAt,
    }
    trace.value = [...(snap.trace ?? [])]
    primePermission()
    geoResume()
    startPolling()
    if (wake.isSupported.value) {
      try { await wake.request('screen') } catch { /* ignore */ }
    }
  }

  /** Returns true when there's a usable persisted ride to offer
   *  resuming. Used by RideResumeBanner on app boot. */
  function resumeIsAvailable(): boolean {
    const snap = snapshot.value
    if (!snap) return false
    if (snap.v !== SNAPSHOT_SCHEMA_VERSION) return false
    if (!snap.plan || snap.status === 'idle' || snap.status === 'arrived') return false
    if (!snap.startedAt || Date.now() - snap.startedAt > RESUME_STALE_MS) return false
    return true
  }

  function discardSnapshot() {
    snapshot.value = emptySnapshot()
  }

  function markBatteryWarned() {
    batteryWarned.value = true
  }

  function confirmBoarded() {
    state.value = reduce(state.value, { type: 'confirmBoarded', at: Date.now() })
  }

  function confirmAlighted() {
    state.value = reduce(state.value, { type: 'confirmAlighted', at: Date.now() })
  }

  function setEnabled(value: boolean) {
    enabled.value = value
  }

  const status = computed(() => state.value.status)
  const currentStep = computed<PlanStep | null>(
    () => state.value.plan?.steps[state.value.stepIdx] ?? null,
  )
  const target = computed<LatLng | null>(() => resolveTickTarget(state.value))
  const distanceToTargetM = computed<number | null>(() => {
    const fix = state.value.lastFix
    const t = target.value
    if (!fix || !t) return null
    return haversineM(fix, t)
  })
  const isStale = computed(() => isStaleFix(state.value, Date.now()))
  const isActive = computed(() => state.value.status !== 'idle')

  // Post-ride summary — only meaningful when status === 'arrived' or
  // a snapshot is being inspected post-stop. Computed eagerly so the
  // share card can render any time the data is present.
  const summary = computed<RideSummary | null>(() => {
    const plan = state.value.plan
    if (!plan || !state.value.startedAt) return null
    const endedAt = state.value.endedAt ?? Date.now()
    const seenKor = new Set<string>()
    const corridors: { kor: string; color: string }[] = []
    for (const step of plan.steps) {
      if (step.kind !== 'ride' || !step.kor) continue
      if (seenKor.has(step.kor)) continue
      seenKor.add(step.kor)
      corridors.push({ kor: step.kor, color: brt.colorForKor(step.kor) || '#0EA5E9' })
    }
    const origin = trip.origin?.label ?? plan.steps[0]?.fromName ?? '—'
    const destination = trip.destination?.label ?? plan.steps.at(-1)?.toName ?? '—'
    // Operator logos live in /public so they're same-origin — the
    // share card's html-to-image pass would otherwise taint the
    // canvas reading from the CORS-less upstream BRT host.
    const cityLogo = cityStore.slug === 'palu' ? '/operators/trans-palu.png' : '/operators/trans-donggala.png'
    const originPt: [number, number] | null = trip.origin
      ? [trip.origin.point.lat, trip.origin.point.lng]
      : null
    const destPt: [number, number] | null = trip.destination
      ? [trip.destination.point.lat, trip.destination.point.lng]
      : null
    const paths = buildTripPaths(
      plan,
      { corridorByKor: brt.corridorByKor, halte: brt.halte, colorForKor: brt.colorForKor },
      originPt,
      destPt,
    )
    return {
      city: cityStore.slug,
      origin,
      destination,
      durationMin: Math.max(1, Math.round((endedAt - state.value.startedAt) / 60_000)),
      walkM: plan.totalWalkM,
      rideM: plan.totalRideM,
      corridors,
      trace: trace.value.slice(),
      paths,
      cityLogo,
      operator: cityStore.slug === 'palu' ? 'Trans Palu' : 'Trans Donggala',
      startedAt: state.value.startedAt,
      endedAt,
    }
  })

  // Persist on every state-machine transition. We don't write per
  // GPS fix — only on status / stepIdx changes — to keep localStorage
  // writes proportional to user-meaningful progress, not GPS cadence.
  watch(
    () => [state.value.status, state.value.stepIdx] as const,
    ([status, stepIdx]) => {
      if (status === 'idle') return
      snapshot.value = {
        v: SNAPSHOT_SCHEMA_VERSION,
        status,
        plan: state.value.plan,
        stepIdx,
        startedAt: state.value.startedAt,
        trace: trace.value.slice(),
      }
    },
  )

  return {
    // state
    enabled,
    state,
    trace,
    status,
    currentStep,
    target,
    distanceToTargetM,
    isStale,
    isActive,
    summary,
    online,
    geoError,
    wakeSupported: wake.isSupported,
    wakeActive: wake.isActive,
    batteryWarned,
    // actions
    start,
    stop,
    confirmBoarded,
    confirmAlighted,
    setEnabled,
    resumeFromSnapshot,
    resumeIsAvailable,
    discardSnapshot,
    markBatteryWarned,
  }
})
