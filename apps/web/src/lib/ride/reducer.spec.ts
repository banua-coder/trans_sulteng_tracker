import { describe, expect, it } from 'vitest'
import type { PlanResult, PlanStep } from '@/lib/tripPlanner'
import type { LatLng } from '@/lib/geo'
import {
  BOARDING_NEAR_HALTE_M,
  BOARDING_SPEED_KMH,
  STALE_MS,
  initialState,
  isStaleFix,
  reduce,
  statusForStep,
  type RideEvent,
  type RideState,
} from './reducer'

const HALTE_A: LatLng = { lat: -0.9, lng: 119.85 }
const HALTE_B: LatLng = { lat: -0.91, lng: 119.86 }
const HALTE_C: LatLng = { lat: -0.92, lng: 119.87 }

function step(kind: PlanStep['kind'], from = 'X', to = 'Y', kor?: string): PlanStep {
  return { kind, fromName: from, toName: to, kor, durationMin: 5, distM: 500 }
}

function plan(...steps: PlanStep[]): PlanResult {
  return {
    totalMin: steps.reduce((s, x) => s + x.durationMin, 0),
    totalWalkM: steps.filter((s) => s.kind === 'walk').reduce((s, x) => s + x.distM, 0),
    totalRideM: steps.filter((s) => s.kind === 'ride').reduce((s, x) => s + x.distM, 0),
    steps,
    nodes: [],
  }
}

function start(s: RideState, p: PlanResult): RideState {
  return reduce(s, { type: 'start', plan: p, at: 1_000 })
}

function tick(
  s: RideState,
  target: LatLng | null,
  fix: LatLng & { ts?: number },
  speedKmh: number | null = null,
): RideState {
  const ev: RideEvent = {
    type: 'gpsTick',
    fix: { lat: fix.lat, lng: fix.lng, ts: fix.ts ?? 2_000 },
    target,
    speedKmh,
  }
  return reduce(s, ev)
}

describe('statusForStep', () => {
  it('maps each step kind to a status', () => {
    expect(statusForStep(step('walk'))).toBe('walking')
    expect(statusForStep(step('ride'))).toBe('waiting')
    expect(statusForStep(step('transfer'))).toBe('transferring')
    expect(statusForStep(undefined)).toBe('arrived')
  })
})

describe('reduce — lifecycle', () => {
  it('start() sets status from first step and stores plan', () => {
    const p = plan(step('walk', 'origin', 'A'), step('ride', 'A', 'B', 'K1'))
    const s = start(initialState(), p)
    expect(s.status).toBe('walking')
    expect(s.stepIdx).toBe(0)
    expect(s.plan).toBe(p)
    expect(s.startedAt).toBe(1_000)
  })

  it('stop() resets to idle and clears the plan', () => {
    const p = plan(step('walk'))
    let s = start(initialState(), p)
    s = reduce(s, { type: 'stop', at: 5_000 })
    expect(s.status).toBe('idle')
    expect(s.plan).toBeNull()
    expect(s.endedAt).toBe(5_000)
  })
})

describe('reduce — walking transitions', () => {
  it('does not advance on a single fix inside the threshold (debounce)', () => {
    const p = plan(step('walk'), step('ride', 'A', 'B', 'K1'))
    const s0 = start(initialState(), p)
    const s1 = tick(s0, HALTE_A, HALTE_A)
    expect(s1.status).toBe('walking')
    expect(s1.proximityHits).toBe(1)
  })

  it('advances after 2 consecutive fixes inside the threshold', () => {
    const p = plan(step('walk'), step('ride', 'A', 'B', 'K1'))
    let s = start(initialState(), p)
    s = tick(s, HALTE_A, HALTE_A, null)
    s = tick(s, HALTE_A, HALTE_A, null)
    expect(s.status).toBe('waiting')
    expect(s.stepIdx).toBe(1)
  })

  it('resets debounce when a fix lands outside the threshold', () => {
    const p = plan(step('walk'), step('ride', 'A', 'B', 'K1'))
    let s = start(initialState(), p)
    s = tick(s, HALTE_A, HALTE_A) // hit
    s = tick(s, HALTE_A, HALTE_C) // miss, far away
    expect(s.proximityHits).toBe(0)
    expect(s.status).toBe('walking')
  })
})

describe('reduce — board heuristic', () => {
  it('auto-boards when speed and proximity both pass', () => {
    const p = plan(step('ride', 'A', 'B', 'K1'))
    const s0 = start(initialState(), p)
    expect(s0.status).toBe('waiting')
    const s1 = tick(s0, HALTE_A, HALTE_A, BOARDING_SPEED_KMH + 1)
    expect(s1.status).toBe('on-bus')
  })

  it('does not auto-board when speed is below threshold', () => {
    const p = plan(step('ride', 'A', 'B', 'K1'))
    const s0 = start(initialState(), p)
    const s1 = tick(s0, HALTE_A, HALTE_A, BOARDING_SPEED_KMH - 1)
    expect(s1.status).toBe('waiting')
  })

  it('does not auto-board when too far from boarding halte', () => {
    const p = plan(step('ride', 'A', 'B', 'K1'))
    const s0 = start(initialState(), p)
    // HALTE_C is ~1.5 km from HALTE_A — way outside BOARDING_NEAR_HALTE_M
    const s1 = tick(s0, HALTE_A, HALTE_C, BOARDING_SPEED_KMH + 5)
    expect(s1.status).toBe('waiting')
  })

  it('confirmBoarded overrides the heuristic when waiting', () => {
    const p = plan(step('ride', 'A', 'B', 'K1'))
    let s = start(initialState(), p)
    s = reduce(s, { type: 'confirmBoarded', at: 3_000 })
    expect(s.status).toBe('on-bus')
  })

  it('confirmBoarded is a no-op outside waiting', () => {
    const p = plan(step('walk'))
    let s = start(initialState(), p)
    s = reduce(s, { type: 'confirmBoarded', at: 3_000 })
    expect(s.status).toBe('walking')
  })

  it('exports a sensible boarding-distance constant', () => {
    expect(BOARDING_NEAR_HALTE_M).toBeGreaterThan(0)
  })
})

describe('reduce — on-bus advance + arrival', () => {
  it('advances on-bus → next step after 2 debounced fixes near leg end', () => {
    const p = plan(step('ride', 'A', 'B', 'K1'), step('walk', 'B', 'destination'))
    let s = start(initialState(), p)
    s = reduce(s, { type: 'confirmBoarded', at: 3_000 })
    s = tick(s, HALTE_B, HALTE_B)
    s = tick(s, HALTE_B, HALTE_B)
    expect(s.status).toBe('walking')
    expect(s.stepIdx).toBe(1)
  })

  it('confirmAlighted advances immediately, no debounce', () => {
    const p = plan(step('ride', 'A', 'B', 'K1'), step('walk', 'B', 'destination'))
    let s = start(initialState(), p)
    s = reduce(s, { type: 'confirmBoarded', at: 3_000 })
    s = reduce(s, { type: 'confirmAlighted', at: 4_000 })
    expect(s.status).toBe('walking')
    expect(s.stepIdx).toBe(1)
  })

  it('arrives once the final step completes', () => {
    const p = plan(step('walk'))
    let s = start(initialState(), p)
    s = tick(s, HALTE_A, HALTE_A)
    s = tick(s, HALTE_A, HALTE_A)
    expect(s.status).toBe('arrived')
    expect(s.endedAt).not.toBeNull()
  })
})

describe('isStaleFix', () => {
  it('reports stale before any fix while a ride is active', () => {
    const p = plan(step('walk'))
    const s = start(initialState(), p)
    expect(isStaleFix(s, 9_999)).toBe(true)
  })

  it('reports stale when last fix is older than STALE_MS', () => {
    const p = plan(step('walk'))
    let s = start(initialState(), p)
    s = tick(s, HALTE_A, { ...HALTE_A, ts: 1_000 })
    expect(isStaleFix(s, 1_000 + STALE_MS + 1)).toBe(true)
  })

  it('is never stale in idle / arrived', () => {
    expect(isStaleFix(initialState(), Date.now())).toBe(false)
  })
})
