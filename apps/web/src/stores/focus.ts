import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useBrtStore } from './brt'
import { useSelectionStore } from './selection'
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
    return brt.getHalteForLeg(c.kor, wantToward, wantOrigin)
  })

  const halteCountByDirection = computed<{ a: number; b: number }>(() => {
    const c = corridor.value
    if (!c) return { a: 0, b: 0 }
    return {
      a: brt.getHalteForLeg(c.kor, c.toward, c.origin).length,
      b: brt.getHalteForLeg(c.kor, c.origin, c.toward).length,
    }
  })

  const directionAvailable = computed<{ a: boolean; b: boolean }>(() => {
    return { a: corridor.value !== null, b: corridor.value !== null }
  })

  function focus(nextKor: string) {
    useSelectionStore().clear()
    kor.value = nextKor
    direction.value = 'a'
    const c = brt.corridorByKor.get(nextKor)
    if (c) {
      // Fire-and-forget — both legs prefetched so direction toggle is instant.
      brt.ensureHalteForLeg(c.kor, c.toward, c.origin).catch(() => {})
      brt.ensureHalteForLeg(c.kor, c.origin, c.toward).catch(() => {})
    }
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
