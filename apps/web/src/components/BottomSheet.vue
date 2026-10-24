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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Two snaps only — peek (handle + first row) and mid (50 dvh, the
// user-requested cap). No 'full' snap, so the sheet never covers
// more than half the viewport and the map above always stays usable.
type Snap = 'peek' | 'mid'
/** Collapsed height: the drag row plus a hint of the panel. */
const PEEK_PX = 56

const props = defineProps<{ forceSnap?: Snap | null; ping?: number }>()

const snap = ref<Snap>('peek')

watch(
  () => props.forceSnap,
  (next) => {
    if (next) snap.value = next
  },
)
watch(() => props.ping, () => { snap.value = 'mid' })
const sheetEl = ref<HTMLElement | null>(null)
const dragging = ref(false)

let startY = 0

// Peek is a fixed strip. Mid fits its content up to half the viewport,
// so a short detail card does not leave an empty panel under it.
const sheetStyle = computed(() => ({
  bottom: 'var(--nav-h, 0px)',
  height: snap.value === 'peek' ? `${PEEK_PX}px` : 'auto',
  maxHeight: '50dvh',
  transition: 'height 280ms ease',
}))

// Swipe up opens, swipe down collapses; a plain tap toggles. The sheet
// height itself animates (see sheetStyle), so no per-pixel tracking.
const SWIPE_PX = 24

function onPointerDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  dragging.value = true
  startY = e.clientY
}

function onPointerMove() {}

function onPointerUp(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  const dy = e.clientY - startY
  if (dy <= -SWIPE_PX) snap.value = 'mid'
  else if (dy >= SWIPE_PX) snap.value = 'peek'
  else cycle()
}

function cycle() {
  snap.value = snap.value === 'peek' ? 'mid' : 'peek'
}

// Expose the sheet's snap-state height as a CSS variable on the
// document root so CityView's map can reserve exactly the right
// amount of bottom inset (and re-flow when the user drags). The map
// frame will end at the sheet's top edge at every snap.
let sizeObserver: ResizeObserver | null = null

function syncCssVar() {
  if (typeof document === 'undefined' || !sheetEl.value) return
  // The sheet rides above the bottom nav, so the map must clear both.
  const nav = document.getElementById('mobile-nav')?.offsetHeight ?? 0
  document.documentElement.style.setProperty('--sheet-h', `${sheetEl.value.offsetHeight + nav}px`)
}

onMounted(() => {
  syncCssVar()
  // Content decides the mid height, so follow the real size.
  if (sheetEl.value && typeof ResizeObserver !== 'undefined') {
    sizeObserver = new ResizeObserver(syncCssVar)
    sizeObserver.observe(sheetEl.value)
    const nav = document.getElementById('mobile-nav')
    if (nav) sizeObserver.observe(nav)
  }
})

watch(snap, () => nextTick(syncCssVar))

onBeforeUnmount(() => {
  sizeObserver?.disconnect()
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
    <!-- Drag zone: the whole top row, not just the pill, and
         touch-action none so a finger drag moves the sheet instead of
         scrolling the page. The button collapses it in one tap so the
         map can be seen in full. -->
    <div
      class="relative flex h-11 shrink-0 touch-none items-center justify-center"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <span class="h-1 w-10 rounded-full bg-bnc-stone-300 dark:bg-bnc-stone-700" aria-hidden />
      <button
        type="button"
        class="absolute right-2 top-1/2 flex min-h-11 -translate-y-1/2 items-center gap-1 rounded-full px-3 text-xs font-medium text-bnc-stone-600 dark:text-bnc-stone-300"
        :aria-expanded="snap === 'mid'"
        @pointerdown.stop
        @click="cycle"
      >
        {{ snap === 'mid' ? t('sheet.showMap') : t('sheet.showPanel') }}
        <svg class="h-3.5 w-3.5 transition-transform" :class="snap === 'mid' ? '' : 'rotate-180'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </div>

    <div class="min-h-0 overflow-y-auto px-4 pb-4" data-sheet-scroll>
      <slot />
    </div>
  </aside>
</template>
