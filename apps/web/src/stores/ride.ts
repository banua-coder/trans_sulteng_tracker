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

export interface RideSummary {
  city: 'palu' | 'donggala'
  origin: string
  destination: string
  durationMin: number
  walkM: number
  rideM: number
  corridors: { kor: string; color: string }[]
  trace: Array<[number, number]>
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
  const { coords, locatedAt, error: geoError, resume: geoResume, pause: geoPause }
    = useGeolocation({ enableHighAccuracy: true, maximumAge: 5_000, immediate: false })

  // Drive the reducer off coords updates. `locatedAt` ticks once per
  // resolved fix, so we use it as the single trigger.
  watch(locatedAt, (ts) => {
    if (!ts) return
    const c = coords.value
    if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return
    const fix: PositionFix = { lat: c.latitude, lng: c.longitude, ts }
    pushFix(fix)
    pushTrace(fix)
    const speedKmh = computeSpeedKmh(fixBuffer.value)
    state.value = reduce(state.value, {
      type: 'gpsTick',
      fix,
      speedKmh,
      target: resolveTickTarget(state.value),
    })
  })

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
      if (wake.isSupported.value && !wake.isActive.value) {
        try { await wake.request('screen') } catch { /* user denied or unsupported */ }
      }
    } else {
      geoPause()
    }
  })

  async function start(plan: PlanResult): Promise<void> {
    if (!enabled.value) return
    fixBuffer.value = []
    trace.value = []
    state.value = reduce(state.value, { type: 'start', plan, at: Date.now() })
    geoResume()
    if (wake.isSupported.value) {
      try { await wake.request('screen') } catch { /* ignore */ }
    }
  }

  async function stop(): Promise<void> {
    state.value = reduce(state.value, { type: 'stop', at: Date.now() })
    geoPause()
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
    geoResume()
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
    const meta = brt.cities.find((c) => c.pref === cityStore.pref)
    const origin = trip.origin?.label ?? plan.steps[0]?.fromName ?? '—'
    const destination = trip.destination?.label ?? plan.steps.at(-1)?.toName ?? '—'
    return {
      city: cityStore.slug,
      origin,
      destination,
      durationMin: Math.max(1, Math.round((endedAt - state.value.startedAt) / 60_000)),
      walkM: plan.totalWalkM,
      rideM: plan.totalRideM,
      corridors,
      trace: trace.value.slice(),
      cityLogo: meta?.icon ?? '',
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
