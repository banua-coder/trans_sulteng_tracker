import { describe, expect, it } from 'vitest'
import { isTourWorthShowing, MIN_TOUR_STEPS } from './useTour'

describe('isTourWorthShowing', () => {
  it('rejects zero steps', () => {
    expect(isTourWorthShowing(0)).toBe(false)
  })

  it('rejects a single orphaned step', () => {
    expect(isTourWorthShowing(1)).toBe(false)
  })

  it('accepts the configured minimum', () => {
    expect(isTourWorthShowing(MIN_TOUR_STEPS)).toBe(true)
  })

  it('accepts a full multi-step tour', () => {
    expect(isTourWorthShowing(5)).toBe(true)
  })
})
