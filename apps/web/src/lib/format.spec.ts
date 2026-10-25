import { describe, expect, it } from 'vitest'
import { formatPlateForSpeech, isStale } from './format'
import type { BrtBus } from '@/types/brt'

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

import { prettyName } from './format'

describe('prettyName', () => {
  it('title-cases shouted names and keeps short acronyms', () => {
    expect(prettyName('TRANFERPOINT TAMAN GOR')).toBe('Tranferpoint Taman GOR')
    expect(prettyName('PELABUHAN PANTOLOAN')).toBe('Pelabuhan Pantoloan')
  })
  it('leaves mixed-case names alone', () => {
    expect(prettyName('Halte Unisa 2')).toBe('Halte Unisa 2')
  })
})

describe('isStale device time', () => {
  const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().slice(0, 19).replace('T', ' ')
  const bus = (dt: string) => ({ speed: 0, dt_tracker: dt, _receivedAt: Date.now() }) as unknown as BrtBus
  it('flags a bus the server keeps relaying while its device went quiet', () => {
    expect(isStale(bus(iso(75 * 60_000)))).toBe(true)
  })
  it('keeps a bus whose device just reported', () => {
    expect(isStale(bus(iso(3_000)))).toBe(false)
  })
})
