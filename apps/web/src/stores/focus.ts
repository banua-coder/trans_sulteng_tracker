import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useBrtStore } from './brt'
import type { BrtHalte } from '@/types/brt'

/** Direction along a corridor:
 *  - 'a' = origin → toward (the corridor's primary direction; uses points_a)
 *  - 'b' = toward → origin (reverse leg; uses points_b)
 */
export type Direction = 'a' | 'b'

export const useFocusStore = defineStore('focus', () => {
  const kor = ref<string | null>(null)
  const direction = ref<Direction>('a')

  const brt = useBrtStore()

  const corridor = computed(() =>
    kor.value ? (brt.corridorByKor.get(kor.value) ?? null) : null,
  )

  const isFocused = computed(() => kor.value !== null)

  /** Halte on the focused corridor + chosen direction, in API response order. */
  const halte = computed<BrtHalte[]>(() => {
    const c = corridor.value
    if (!c) return []
    const wantOrigin = direction.value === 'a' ? c.origin : c.toward
    const wantToward = direction.value === 'a' ? c.toward : c.origin
    return brt.halte.filter(
      (h) =>
        h.kor === c.kor &&
        h.origin === wantOrigin &&
        h.toward === wantToward,
    )
  })

  /** Halte counts per direction for the focused corridor. Lets the UI
   *  hide / disable the reverse-direction tab when the operator's
   *  upstream feed doesn't include halte for that leg (e.g. K2A in
   *  Trans Palu currently has zero reverse halte). */
  const halteCountByDirection = computed<{ a: number; b: number }>(() => {
    const c = corridor.value
    if (!c) return { a: 0, b: 0 }
    let a = 0
    let b = 0
    for (const h of brt.halte) {
      if (h.kor !== c.kor) continue
      if (h.origin === c.origin && h.toward === c.toward) a++
      else if (h.origin === c.toward && h.toward === c.origin) b++
    }
    return { a, b }
  })

  const directionAvailable = computed<{ a: boolean; b: boolean }>(() => {
    const { a, b } = halteCountByDirection.value
    return { a: a > 0, b: b > 0 }
  })

  function focus(nextKor: string) {
    kor.value = nextKor
    direction.value = 'a'
  }

  function setDirection(d: Direction) {
    // Refuse to switch to a direction with zero halte — keeps the
    // current view intact instead of going blank.
    if (!directionAvailable.value[d]) return
    direction.value = d
  }

  function toggleDirection() {
    const next: Direction = direction.value === 'a' ? 'b' : 'a'
    if (!directionAvailable.value[next]) return
    direction.value = next
  }

  function clear() {
    kor.value = null
    direction.value = 'a'
  }

  return {
    kor,
    direction,
    corridor,
    halte,
    isFocused,
    halteCountByDirection,
    directionAvailable,
    focus,
    setDirection,
    toggleDirection,
    clear,
  }
})
