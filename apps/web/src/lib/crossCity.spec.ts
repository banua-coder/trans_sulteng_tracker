import { describe, expect, it } from 'vitest'
import { korLabel, nsHalte, splitKor } from './crossCity'
import type { BrtHalte } from '@/types/brt'

describe('crossCity', () => {
  it('namespaces kor and in_koridor, labels stay plain', () => {
    const h = { kor: 'K1', in_koridor: 'K1|K2A' } as BrtHalte
    const n = nsHalte('11', h)
    expect(n.kor).toBe('11:K1')
    expect(n.in_koridor).toBe('11:K1|11:K2A')
    expect(korLabel(n.kor)).toBe('K1')
    expect(splitKor('K1')).toEqual({ pref: null, kor: 'K1' })
  })
})
