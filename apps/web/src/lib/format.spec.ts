import { describe, expect, it } from 'vitest'
import { formatPlateForSpeech } from './format'

describe('formatPlateForSpeech', () => {
  it('spaces every char and comma-separates chunks', () => {
    expect(formatPlateForSpeech('DN 7576 AU')).toBe('D N, 7 5 7 6, A U')
  })

  it('handles two-letter prefix + three-letter suffix plates', () => {
    expect(formatPlateForSpeech('B 1234 ABC')).toBe('B, 1 2 3 4, A B C')
  })

  it('uppercases lowercase plates', () => {
    expect(formatPlateForSpeech('dn 7576 au')).toBe('D N, 7 5 7 6, A U')
  })

  it('collapses extra whitespace + drops punctuation', () => {
    expect(formatPlateForSpeech('  DN   7576-AU  ')).toBe('D N, 7 5 7 6 A U')
  })

  it('returns empty for null / undefined / empty', () => {
    expect(formatPlateForSpeech(null)).toBe('')
    expect(formatPlateForSpeech(undefined)).toBe('')
    expect(formatPlateForSpeech('')).toBe('')
  })
})
