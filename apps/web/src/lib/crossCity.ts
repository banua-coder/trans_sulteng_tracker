/**
 * The other city's corridors join the planner graph under a namespaced
 * kor (`11:K1`) because both cities reuse codes like "K1". The current
 * city keeps its plain codes, so nothing else in the app changes.
 */
import type { BrtCorridor, BrtHalte } from '@/types/brt'

export const nsKor = (pref: string, kor: string): string => `${pref}:${kor}`
/** "11:K1" → pref "11", kor "K1". Plain codes return pref null. */
export function splitKor(kor: string): { pref: string | null; kor: string } {
  const i = kor.indexOf(':')
  return i < 0 ? { pref: null, kor } : { pref: kor.slice(0, i), kor: kor.slice(i + 1) }
}
/** City name for a namespaced kor's prefix, null for the current city. */
export function korCity(kor: string): string | null {
  const p = splitKor(kor).pref
  return p === '11' ? 'Donggala' : p === '12' ? 'Palu' : null
}

/** Code shown to riders: always the plain one. */
export const korLabel = (kor: string): string => splitKor(kor).kor

export function nsCorridor(pref: string, c: BrtCorridor): BrtCorridor {
  return { ...c, kor: nsKor(pref, c.kor) }
}

export function nsHalte(pref: string, h: BrtHalte): BrtHalte {
  return {
    ...h,
    kor: nsKor(pref, h.kor),
    in_koridor: (h.in_koridor ?? '')
      .split('|')
      .filter(Boolean)
      .map((k) => nsKor(pref, k))
      .join('|'),
  }
}
