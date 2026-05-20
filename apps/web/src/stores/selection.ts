import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useBrtStore } from './brt'

export type SelectionKind = 'bus' | 'halte' | null
export interface SelectionFrame {
  kind: 'bus' | 'halte'
  id: string
}

export const useSelectionStore = defineStore('selection', () => {
  // Stack of selection frames. The top frame is the currently-shown
  // detail card; popping (back()) returns to the previous frame, so
  // the user can drill Corridor -> Bus -> Halte -> Bus -> ... and
  // walk back out the same way. clear() empties the entire stack
  // (used by explicit corridor focus, city change, and URL sync).
  const stack = ref<SelectionFrame[]>([])

  const brt = useBrtStore()

  const kind = computed<SelectionKind>(() => stack.value.at(-1)?.kind ?? null)
  const id = computed<string | null>(() => stack.value.at(-1)?.id ?? null)

  const selectedBus = computed(() => {
    if (kind.value !== 'bus' || !id.value) return null
    return brt.buses.get(id.value) ?? null
  })

  const selectedHalte = computed(() => {
    if (kind.value !== 'halte' || !id.value) return null
    return brt.halte.find((h) => h.sh_id === id.value) ?? null
  })

  // Per-halte corridor filter for the incoming-bus list. null = show
  // every approaching bus regardless of kor. Set by HalteDetailCard
  // when the user taps a corridor pill on a multi-corridor stop.
  // Reset whenever the selected halte itself changes — a filter
  // chosen for stop A should not leak into stop B.
  const halteFilterKor = ref<string | null>(null)
  watch(
    () => (kind.value === 'halte' ? id.value : null),
    () => { halteFilterKor.value = null },
  )
  function toggleHalteFilter(kor: string) {
    halteFilterKor.value = halteFilterKor.value === kor ? null : kor
  }
  function clearHalteFilter() {
    halteFilterKor.value = null
  }

  // Drill into a new selection. If the top frame already matches the
  // requested frame, no-op (avoids stack growth on re-tap). If the top
  // frame is the SAME kind but a different id, replace it (lateral
  // navigation within the same panel). Otherwise push a new frame so
  // back() returns to the previous level.
  function pushOrReplace(frame: SelectionFrame) {
    const top = stack.value.at(-1)
    if (top && top.kind === frame.kind && top.id === frame.id) return
    if (top && top.kind === frame.kind) {
      stack.value = [...stack.value.slice(0, -1), frame]
      return
    }
    stack.value = [...stack.value, frame]
  }

  function selectBus(imei: string) {
    pushOrReplace({ kind: 'bus', id: imei })
  }

  function selectHalte(sh_id: string) {
    pushOrReplace({ kind: 'halte', id: sh_id })
  }

  // Back-button behaviour: pop one frame. When the stack drains to
  // empty the cascade in CityView falls through to whatever's next
  // (corridor focus, trip plan, routes list).
  function back() {
    if (stack.value.length === 0) return
    stack.value = stack.value.slice(0, -1)
  }

  // Wipe the entire stack. Used by:
  //   - focus.focus() — explicit corridor switch should reset detail nav
  //   - city change watcher — different city, different state
  //   - urlSync — incoming URL is authoritative, replaces stack
  function clear() {
    if (stack.value.length === 0) return
    stack.value = []
  }

  return {
    kind,
    id,
    selectedBus,
    selectedHalte,
    halteFilterKor,
    selectBus,
    selectHalte,
    toggleHalteFilter,
    clearHalteFilter,
    back,
    clear,
  }
})
