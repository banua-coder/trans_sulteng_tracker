import { describe, expect, it } from 'vitest'
import { buildGraph, planTrip } from '@/lib/tripPlanner'
import { nsHalte } from '@/lib/crossCity'
import type { BrtHalte } from '@/types/brt'

function halte(kor: string, id: string, name: string, lat: number, lng: number): BrtHalte {
  return {
    sh_id: id, sh_name: name, kor, origin: '', toward: '',
    sh_lat: String(lat), sh_lng: String(lng),
    or_lat: '', or_lng: '', tw_lat: '', tw_lng: '',
    points: '', color: '', in_koridor: kor, color_koridor: '',
  }
}

// X runs south along lng 119.800; Y runs east along lat -0.806.
const X = [
  halte('X', 'x1', 'X One', -0.780, 119.8),
  halte('X', 'x2', 'X Two', -0.793, 119.8),
  halte('X', 'x3', 'X Three', -0.806, 119.8),
]
// Y1 sits 100 m east of X3 and has a different name on purpose.
const Y = [
  halte('Y', 'y1', 'Y One', -0.806, 119.8009),
  halte('Y', 'y2', 'Y Two', -0.806, 119.804),
  halte('Y', 'y3', 'Y Three', -0.806, 119.808),
]
const NEAR_X1 = { lat: -0.7801, lng: 119.8 }
const NEAR_Y3 = { lat: -0.806, lng: 119.8089 }

describe('planTrip', () => {
  it('transfers between differently named stops that are close together', () => {
    const g = buildGraph([], [X, Y])
    const plans = planTrip(g, NEAR_X1, NEAR_Y3)
    expect(plans.length).toBeGreaterThan(0)
    const rides = plans[0].steps.filter((s) => s.kind === 'ride').map((s) => s.kor)
    expect(rides).toEqual(['X', 'Y'])
    expect(plans[0].steps.some((s) => s.kind === 'transfer')).toBe(true)
  })

  it('does not link same-named stops that are far apart', () => {
    const farY = Y.map((h) => ({ ...h, sh_name: h.sh_id === 'y1' ? 'X Three' : h.sh_name, sh_lat: String(-0.83) }))
    const g = buildGraph([], [X, farY])
    expect(planTrip(g, NEAR_X1, { lat: -0.83, lng: 119.8089 })).toEqual([])
  })

  it('never returns a plan without a bus ride', () => {
    const g = buildGraph([], [X, Y])
    // Origin and destination both a short walk from the same stop.
    expect(planTrip(g, { lat: -0.7801, lng: 119.8 }, { lat: -0.7803, lng: 119.8 })).toEqual([])
  })

  it('keeps a picked origin stop instead of walking to a nearby one', () => {
    const g = buildGraph([], [X, Y])
    // 166 m from the nearest stop: unpinned walks in, pinned (60 m) finds none.
    const far = { lat: -0.7815, lng: 119.8 }
    expect(planTrip(g, far, NEAR_Y3).length).toBeGreaterThan(0)
    expect(planTrip(g, far, NEAR_Y3, 5, null, { originPinned: true })).toEqual([])
  })

  it('rides across cities when both reuse the same corridor code', () => {
    // Two cities, both with a corridor called X; the second is namespaced.
    const otherX = X.map((h) => nsHalte('11', { ...h, sh_id: 'o' + h.sh_id, sh_lat: String(parseFloat(h.sh_lat) - 0.026) }))
    const g = buildGraph([], [X, otherX])
    // otherX1 lands on X3, so the trip changes there and rides on south.
    const plans = planTrip(g, NEAR_X1, { lat: -0.8321, lng: 119.8 })
    const rides = plans[0]?.steps.filter((s) => s.kind === 'ride').map((s) => s.kor)
    expect(rides).toEqual(['X', '11:X'])
  })
})
