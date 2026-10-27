import { describe, expect, it } from 'vitest'
import { distanceToLines, locateOffRoute, type Line } from './offRoute'

// A runs along lat -0.80 from lng 119.80 to 119.82; B along lat -0.81.
const A: Line = [[-0.8, 119.8], [-0.8, 119.82]]
const B: Line = [[-0.81, 119.8], [-0.81, 119.82]]
const lines = new Map<string, Line[]>([['A', [A]], ['B', [B]]])

describe('offRoute', () => {
  it('measures distance to the nearest segment, not just vertices', () => {
    // 100 m north of the middle of A (0.0009 deg ~ 100 m)
    const d = distanceToLines([-0.7991, 119.81], [A])
    expect(d).toBeGreaterThan(95)
    expect(d).toBeLessThan(105)
  })
  it('is null on its own corridor', () => {
    expect(locateOffRoute([-0.8001, 119.81], 'A', lines)).toBeNull()
  })
  it('names the corridor a bus is actually on', () => {
    const r = locateOffRoute([-0.81, 119.81], 'A', lines)
    expect(r?.onKor).toBe('B')
    expect(r?.m).toBeGreaterThan(1000)
  })
  it('reports off-route without a name when on no corridor', () => {
    const r = locateOffRoute([-0.7, 119.81], 'A', lines)
    expect(r).not.toBeNull()
    expect(r?.onKor).toBeNull()
  })
})
