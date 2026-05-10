<script setup lang="ts">
/**
 * Mobile bottom sheet with three snap points (peek/mid/full).
 * Drag the handle to move between snaps. Falls back to tap-to-cycle
 * for keyboard / non-touch users.
 *
 * `forceSnap` lets the parent bump the sheet open/closed when its
 * content swaps — e.g. opening a bus detail card auto-expands to
 * mid so the user sees the new content without dragging.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// Two snaps only — peek (handle + first row) and mid (50 dvh, the
// user-requested cap). No 'full' snap, so the sheet never covers
// more than half the viewport and the map above always stays usable.
type Snap = 'peek' | 'mid'

const props = defineProps<{ forceSnap?: Snap | null }>()

const snap = ref<Snap>('peek')

watch(
  () => props.forceSnap,
  (next) => {
    if (next) snap.value = next
  },
)
const sheetEl = ref<HTMLElement | null>(null)
const dragging = ref(false)

let startY = 0
let startTranslate = 0
let currentTranslate = 0
let frame: number | null = null

const heights: Record<Snap, string> = {
  peek: '88px',
  mid: '50dvh',
}

const sheetStyle = computed(() => ({
  height: heights[snap.value],
  transform: dragging.value ? `translateY(${currentTranslate}px)` : 'translateY(0)',
  transition: dragging.value ? 'none' : 'height 280ms ease, transform 280ms ease',
}))

function pxOf(snapTo: Snap): number {
  const el = sheetEl.value
  if (!el) return 0
  const h = el.getBoundingClientRect().height
  if (snapTo === 'peek') return h - 88
  if (snapTo === 'mid') return h * 0.5
  return 0
}

function onPointerDown(e: PointerEvent) {
  if (!sheetEl.value) return
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  dragging.value = true
  startY = e.clientY
  startTranslate = pxOf(snap.value)
  currentTranslate = startTranslate
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  const next = startTranslate + (e.clientY - startY)
  currentTranslate = Math.max(0, Math.min(next, pxOf('peek')))
  if (frame) cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    if (sheetEl.value) sheetEl.value.style.transform = `translateY(${currentTranslate}px)`
  })
}

function onPointerUp() {
  if (!dragging.value) return
  dragging.value = false
  // snap to whichever of peek/mid is nearest
  const px = currentTranslate
  const peekPx = pxOf('peek')
  const midPx = pxOf('mid')
  snap.value = Math.abs(px - peekPx) < Math.abs(px - midPx) ? 'peek' : 'mid'
}

function cycle() {
  snap.value = snap.value === 'peek' ? 'mid' : 'peek'
}

// Expose the sheet's snap-state height as a CSS variable on the
// document root so CityView's map can reserve exactly the right
// amount of bottom inset (and re-flow when the user drags). The map
// frame will end at the sheet's top edge at every snap.
function syncCssVar(value: Snap) {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--sheet-h', heights[value])
}

onMounted(() => {
  syncCssVar(snap.value)
})

watch(snap, syncCssVar)

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
  if (typeof document !== 'undefined') {
    document.documentElement.style.removeProperty('--sheet-h')
  }
})
</script>

<template>
  <aside
    ref="sheetEl"
    class="pointer-events-auto fixed inset-x-0 bottom-0 z-[900] flex flex-col rounded-t-[var(--radius-lg)] border-t border-bnc-stone-200 bg-bnc-paper shadow-[var(--shadow-elevated)] dark:border-bnc-stone-800 dark:bg-bnc-stone-900 lg:hidden"
    :style="sheetStyle"
    role="dialog"
    aria-label="Panel koridor"
  >
    <button
      type="button"
      class="grid h-6 shrink-0 place-items-center"
      :aria-expanded="snap === 'mid'"
      @click="cycle"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <span class="h-1 w-10 rounded-full bg-bnc-stone-300 dark:bg-bnc-stone-700" aria-hidden />
      <span class="sr-only">Geser untuk membuka panel</span>
    </button>

    <div class="overflow-y-auto px-4 pb-4">
      <slot />
    </div>
  </aside>
</template>
