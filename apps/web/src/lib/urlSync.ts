/**
 * Two-way sync between the URL query string and the focus / selection
 * stores. Read once on mount to seed state from a deep-linked URL,
 * then watch the stores and push changes back to the URL via
 * router.replace so the back button doesn't fill up with junk.
 *
 * Encoded keys:
 *   ?kor=K1         currently focused corridor
 *   ?dir=a|b        focus direction (only emitted alongside kor)
 *   ?bus=<imei>     selected bus
 *   ?halte=<sh_id>  selected halte
 */
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBrtStore } from '@/stores/brt'
import { useFocusStore } from '@/stores/focus'
import { useSelectionStore } from '@/stores/selection'

export function useUrlSync() {
  const route = useRoute()
  const router = useRouter()
  const focus = useFocusStore()
  const selection = useSelectionStore()
  const brt = useBrtStore()

  let suspendWrite = false
  let pendingApply: { kor?: string; dir?: string; bus?: string; halte?: string } | null = null

  function applyFromQuery() {
    const q = route.query
    suspendWrite = true

    const kor = typeof q.kor === 'string' ? q.kor : null
    const dir = q.dir === 'b' ? 'b' : q.dir === 'a' ? 'a' : null
    if (kor && brt.corridorByKor.get(kor)) {
      focus.focus(kor)
      if (dir) focus.setDirection(dir)
    } else if (!kor && focus.kor) {
      focus.clear()
    }

    if (typeof q.bus === 'string') {
      selection.selectBus(q.bus)
    } else if (typeof q.halte === 'string') {
      selection.selectHalte(q.halte)
    } else if (selection.kind !== null) {
      selection.clear()
    }

    suspendWrite = false
  }

  function writeToUrl() {
    if (suspendWrite) return
    const next: Record<string, string> = {}
    if (focus.kor) {
      next.kor = focus.kor
      if (focus.direction === 'b') next.dir = 'b'
    }
    if (selection.kind === 'bus' && selection.id) next.bus = selection.id
    else if (selection.kind === 'halte' && selection.id) next.halte = selection.id
    // Drop any stale keys that shouldn't be present.
    const current = route.query
    const same =
      current.kor === (next.kor ?? undefined) &&
      current.dir === (next.dir ?? undefined) &&
      current.bus === (next.bus ?? undefined) &&
      current.halte === (next.halte ?? undefined)
    if (same) return
    router.replace({ name: route.name ?? undefined, params: route.params, query: next })
  }

  onMounted(() => {
    // Defer the first apply until corridors load so we can validate kor.
    if (brt.corridors.length) applyFromQuery()
    else pendingApply = { ...(route.query as Record<string, string>) }
  })

  // Once corridors arrive, run the deferred apply.
  const stopCorridorWatch = watch(
    () => brt.corridors.length,
    (n) => {
      if (n > 0 && pendingApply) {
        pendingApply = null
        applyFromQuery()
      }
    },
  )

  // Push store → URL.
  const stopFocusWatch = watch(
    () => [focus.kor, focus.direction] as const,
    () => writeToUrl(),
  )
  const stopSelectionWatch = watch(
    () => [selection.kind, selection.id] as const,
    () => writeToUrl(),
  )

  onBeforeUnmount(() => {
    stopCorridorWatch()
    stopFocusWatch()
    stopSelectionWatch()
  })
}
