/**
 * Pure state-machine reducer for trip companion mode. Decoupled from
 * Pinia + VueUse so we can test transitions without faking the
 * browser. All side effects (wake lock, audio, GPS subscription)
 * happen in the store; this file only computes the next state.
 */
import type { PlanResult, PlanStep } from '@/lib/tripPlanner'
import { haversineM, type LatLng, type PositionFix } from '@/lib/geo'

export type { LatLng }

export type RideStatus =
  | 'idle'
  | 'walking'
  | 'waiting'
  | 'on-bus'
  | 'transferring'
  | 'arrived'

export interface RideState {
  status: RideStatus
  plan: PlanResult | null
  /** Index into plan.steps. Always 0 in idle/arrived. */
  stepIdx: number
  /** epoch ms when start() ran. */
  startedAt: number | null
  endedAt: number | null
  /** Latest GPS fix. Null until the first watchPosition callback. */
  lastFix: PositionFix | null
  /** Cached speed reading from the position ring buffer; null when
   *  the buffer has too few fixes. */
  speedKmh: number | null
  /** Consecutive fixes inside the proximity threshold for the
   *  current step — used to debounce single-fix jitter. */
  proximityHits: number
  /** Last time we observed a fresh fix; drives isStale derivations. */
  lastFixAt: number | null
}

export type RideEvent =
  | { type: 'start'; plan: PlanResult; at: number }
  | {
    type: 'gpsTick'
    fix: PositionFix
    speedKmh: number | null
    /** Target the user is heading toward for the current step. The
     *  store resolves this differently for waiting vs on-bus phases
     *  of a ride step (boarding halte vs leg-end halte). */
    target: LatLng | null
  }
  | { type: 'confirmBoarded'; at: number }
  | { type: 'confirmAlighted'; at: number }
  | { type: 'stop'; at: number }

/** Minimum consecutive fixes that satisfy the proximity threshold
 *  before we auto-advance. Defeats single-fix GPS jitter. */
const DEBOUNCE_FIXES = 2

/** Fix is considered stale (suspends heuristic transitions) when
 *  older than this many milliseconds. Manual confirms still work. */
export const STALE_MS = 30_000

/** Speed threshold for the auto-board heuristic (km/h). */
export const BOARDING_SPEED_KMH = 10

/** Distance threshold for the auto-board heuristic (m). */
export const BOARDING_NEAR_HALTE_M = 40

/** Proximity thresholds per step kind. */
export const PROXIMITY_M = {
  walk: 30,
  ride: 100,
  transfer: 30,
}

export function initialState(): RideState {
  return {
    status: 'idle',
    plan: null,
    stepIdx: 0,
    startedAt: null,
    endedAt: null,
    lastFix: null,
    speedKmh: null,
    proximityHits: 0,
    lastFixAt: null,
  }
}

export function statusForStep(step: PlanStep | undefined): RideStatus {
  if (!step) return 'arrived'
  switch (step.kind) {
    case 'walk':
      return 'walking'
    case 'ride':
      return 'waiting'
    case 'transfer':
      return 'transferring'
  }
}

export function reduce(state: RideState, event: RideEvent): RideState {
  switch (event.type) {
    case 'start':
      return {
        ...initialState(),
        status: statusForStep(event.plan.steps[0]),
        plan: event.plan,
        stepIdx: 0,
        startedAt: event.at,
      }

    case 'stop':
      return { ...initialState(), endedAt: event.at }

    case 'confirmBoarded':
      if (state.status !== 'waiting') return state
      return { ...state, status: 'on-bus', proximityHits: 0 }

    case 'confirmAlighted':
      if (state.status !== 'on-bus') return state
      return advance(state, event.at)

    case 'gpsTick': {
      const withFix: RideState = {
        ...state,
        lastFix: event.fix,
        speedKmh: event.speedKmh,
        lastFixAt: event.fix.ts,
      }
      if (state.status === 'idle' || state.status === 'arrived') return withFix
      return applyGpsTransitions(withFix, event)
    }
  }
}

function applyGpsTransitions(
  state: RideState,
  event: Extract<RideEvent, { type: 'gpsTick' }>,
): RideState {
  const step = state.plan?.steps[state.stepIdx]
  if (!step) return state
  const target = event.target
  if (!target) return { ...state, proximityHits: 0 }

  const distM = haversineM(event.fix, target)

  if (state.status === 'waiting') {
    // Auto-board heuristic: moving fast AND close to the boarding
    // halte. The store passes the boarding halte as `target` while
    // status is 'waiting'.
    if (
      event.speedKmh != null
      && event.speedKmh >= BOARDING_SPEED_KMH
      && distM <= BOARDING_NEAR_HALTE_M
    ) {
      return { ...state, status: 'on-bus', proximityHits: 0 }
    }
    return { ...state, proximityHits: 0 }
  }

  const threshold = PROXIMITY_M[step.kind]
  if (distM <= threshold) {
    const hits = state.proximityHits + 1
    if (hits >= DEBOUNCE_FIXES) {
      return advance({ ...state, proximityHits: 0 }, event.fix.ts)
    }
    return { ...state, proximityHits: hits }
  }
  return { ...state, proximityHits: 0 }
}

function advance(state: RideState, at: number): RideState {
  if (!state.plan) return state
  const nextIdx = state.stepIdx + 1
  if (nextIdx >= state.plan.steps.length) {
    return { ...state, status: 'arrived', endedAt: at, stepIdx: state.stepIdx }
  }
  return {
    ...state,
    stepIdx: nextIdx,
    status: statusForStep(state.plan.steps[nextIdx]),
    proximityHits: 0,
  }
}

/** Stale-fix check — used by the store to suppress heuristic-only
 *  cues but keep the rest of the machine alive. */
export function isStaleFix(state: RideState, now: number): boolean {
  if (state.lastFixAt == null) return state.status !== 'idle' && state.status !== 'arrived'
  return now - state.lastFixAt > STALE_MS
}
