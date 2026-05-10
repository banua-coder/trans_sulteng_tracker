<script setup lang="ts">
/**
 * Mobile bottom sheet with three snap points (peek/mid/full).
 * Drag the handle to move between snaps. Falls back to tap-to-cycle
 * for keyboard / non-touch users.
 */
import { computed, onBeforeUnmount, ref } from 'vue'

type Snap = 'peek' | 'mid' | 'full'

const snap = ref<Snap>('peek')
const sheetEl = ref<HTMLElement | null>(null)
const dragging = ref(false)

let startY = 0
let startTranslate = 0
let currentTranslate = 0
let frame: number | null = null

const heights: Record<Snap, string> = {
  peek: '88px',
  mid: '50dvh',
  full: '88dvh',
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
  // snap to nearest of peek/mid/full by translate distance
  const px = currentTranslate
  const peekPx = pxOf('peek')
  const midPx = pxOf('mid')
  const distances: Array<[Snap, number]> = [
    ['peek', Math.abs(px - peekPx)],
    ['mid', Math.abs(px - midPx)],
    ['full', Math.abs(px)],
  ]
  distances.sort((a, b) => a[1] - b[1])
  snap.value = distances[0][0]
}

function cycle() {
  snap.value = snap.value === 'peek' ? 'mid' : snap.value === 'mid' ? 'full' : 'peek'
}

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
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
      :aria-expanded="snap === 'full'"
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
