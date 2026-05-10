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

  function focus(nextKor: string) {
    kor.value = nextKor
    direction.value = 'a'
  }

  function setDirection(d: Direction) {
    direction.value = d
  }

  function toggleDirection() {
    direction.value = direction.value === 'a' ? 'b' : 'a'
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
    focus,
    setDirection,
    toggleDirection,
    clear,
  }
})
