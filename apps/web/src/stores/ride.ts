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
import { useTripStore } from './trip'

const FIX_BUFFER_SIZE = 5
const FEATURE_FLAG_KEY = 'cektrans:rideEnabled'

export const useRideStore = defineStore('ride', () => {
  const brt = useBrtStore()
  const trip = useTripStore()

  // Feature flag — Phases 1-4 ship gated, Phase 5 removes the gate.
  const enabled = useStorage<boolean>(FEATURE_FLAG_KEY, false, localStorage)

  // Reducer-owned state. shallowRef because reduce() returns a new
  // object every call — deep reactivity would be wasted work.
  const state = shallowRef<RideState>(initialState())

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
    const speedKmh = computeSpeedKmh(fixBuffer.value)
    state.value = reduce(state.value, {
      type: 'gpsTick',
      fix,
      speedKmh,
      target: resolveTickTarget(state.value),
    })
  })

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

  return {
    // state
    enabled,
    state,
    status,
    currentStep,
    target,
    distanceToTargetM,
    isStale,
    isActive,
    online,
    geoError,
    wakeSupported: wake.isSupported,
    wakeActive: wake.isActive,
    // actions
    start,
    stop,
    confirmBoarded,
    confirmAlighted,
    setEnabled,
  }
})
