import { describe, expect, it } from 'vitest'
import { haversineM, speedKmh } from './geo'

describe('haversineM', () => {
  it('returns ~0 for identical points', () => {
    const p = { lat: -0.9, lng: 119.85 }
    expect(haversineM(p, p)).toBeLessThan(0.01)
  })

  it('matches a known short distance (~111 m per 0.001° latitude near equator)', () => {
    const a = { lat: -0.9, lng: 119.85 }
    const b = { lat: -0.901, lng: 119.85 }
    const d = haversineM(a, b)
    expect(d).toBeGreaterThan(105)
    expect(d).toBeLessThan(115)
  })

  it('is symmetric', () => {
    const a = { lat: -0.9, lng: 119.85 }
    const b = { lat: -0.95, lng: 119.9 }
    expect(haversineM(a, b)).toBeCloseTo(haversineM(b, a), 5)
  })
})

describe('speedKmh', () => {
  it('returns null for empty or single-fix buffers', () => {
    expect(speedKmh([])).toBeNull()
    expect(speedKmh([{ lat: 0, lng: 0, ts: 0 }])).toBeNull()
  })

  it('returns null when timestamps don\'t advance', () => {
    expect(
      speedKmh([
        { lat: 0, lng: 0, ts: 1000 },
        { lat: 0.001, lng: 0, ts: 1000 },
      ]),
    ).toBeNull()
  })

  it('approximates 36 km/h for 10 m/s over 1 second', () => {
    // 10 m/s ≈ 0.00009° lat per second at equator
    const v = speedKmh([
      { lat: 0, lng: 0, ts: 0 },
      { lat: 0.00009, lng: 0, ts: 1000 },
    ])
    expect(v).not.toBeNull()
    expect(v!).toBeGreaterThan(30)
    expect(v!).toBeLessThan(42)
  })

  it('averages over a multi-fix ring buffer', () => {
    const buf = [
      { lat: 0, lng: 0, ts: 0 },
      { lat: 0.0001, lng: 0, ts: 1000 },
      { lat: 0.0002, lng: 0, ts: 2000 },
      { lat: 0.0003, lng: 0, ts: 3000 },
    ]
    const v = speedKmh(buf)
    expect(v).not.toBeNull()
    expect(v!).toBeGreaterThan(35)
    expect(v!).toBeLessThan(45)
  })
})
