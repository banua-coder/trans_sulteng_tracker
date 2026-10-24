<script setup lang="ts">
/**
 * Product tour UI: a dimmed page with a soft spotlight that glides
 * between targets, and a card with progress dots. On phones the card
 * docks to the bottom edge so it never covers a target near the top.
 * No third-party library: it is a fixed ring (box-shadow cutout) plus
 * one card, positioned from getBoundingClientRect.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { tourState, useTour, visibleTarget } from '@/composables/useTour'

const { t } = useI18n()
const tour = useTour()

const PAD = 6
const GAP = 14
const CARD_W = 320

const cardEl = ref<HTMLElement | null>(null)
const nextBtn = ref<HTMLButtonElement | null>(null)
const rect = ref<{ top: number; left: number; width: number; height: number } | null>(null)
const cardPos = ref<{ top: number; left: number } | null>(null)
const docked = ref(false)

const step = computed(() => tourState.steps[tourState.index] ?? null)
const total = computed(() => tourState.steps.length)
const isLast = computed(() => tourState.index === total.value - 1)

const reduced =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

async function measure() {
  if (!tourState.open || !step.value) return
  const el = visibleTarget(step.value.selector)
  if (!el) {
    rect.value = null
    return
  }
  const r = el.getBoundingClientRect()
  rect.value = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
  docked.value = window.innerWidth < 640
  await nextTick()
  const h = cardEl.value?.offsetHeight ?? 180
  const vw = window.innerWidth
  const vh = window.innerHeight
  const below = rect.value.top + rect.value.height + GAP
  const fitsBelow = below + h <= vh - 12
  const top = fitsBelow ? below : Math.max(12, rect.value.top - GAP - h)
  const left = Math.min(Math.max(12, rect.value.left + rect.value.width / 2 - CARD_W / 2), vw - CARD_W - 12)
  cardPos.value = { top, left }
}

async function show() {
  if (!tourState.open || !step.value) return
  const el = visibleTarget(step.value.selector)
  el?.scrollIntoView({ block: 'center', inline: 'center', behavior: reduced ? 'auto' : 'smooth' })
  await measure()
  // Smooth scroll can still be moving; settle once more.
  setTimeout(measure, 260)
  await nextTick()
  nextBtn.value?.focus({ preventScroll: true })
}

function onKey(e: KeyboardEvent) {
  if (!tourState.open) return
  if (e.key === 'Escape') tour.close()
  else if (e.key === 'ArrowRight') tour.next()
  else if (e.key === 'ArrowLeft') tour.prev()
}

function bind(on: boolean) {
  if (on) {
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('keydown', onKey)
  } else {
    window.removeEventListener('resize', measure)
    window.removeEventListener('scroll', measure, true)
    window.removeEventListener('keydown', onKey)
  }
}

watch(() => [tourState.open, tourState.index] as const, show, { flush: 'post' })
watch(() => tourState.open, bind)
onBeforeUnmount(() => bind(false))
</script>

<template>
  <Teleport to="body">
    <div v-if="tourState.open && step" class="fixed inset-0 z-[3000]">
      <!-- Blocks clicks on the page while the tour is open. -->
      <div class="absolute inset-0" aria-hidden="true" />

      <div
        v-if="rect"
        class="tour-spot pointer-events-none absolute rounded-xl"
        :class="{ 'tour-spot-anim': !reduced }"
        :style="{ top: rect.top + 'px', left: rect.left + 'px', width: rect.width + 'px', height: rect.height + 'px' }"
        aria-hidden="true"
      />

      <section
        ref="cardEl"
        role="dialog"
        aria-modal="true"
        :aria-label="step.title"
        class="tour-card absolute flex flex-col gap-3 rounded-2xl border border-bnc-stone-200 bg-white p-4 text-bnc-ink shadow-[var(--shadow-elevated)] dark:border-bnc-stone-700 dark:bg-bnc-stone-900 dark:text-bnc-paper"
        :class="[docked ? 'inset-x-3 bottom-3' : 'w-80', { 'tour-card-anim': !reduced }]"
        :style="!docked && cardPos ? { top: cardPos.top + 'px', left: cardPos.left + 'px' } : undefined"
      >
        <div class="flex items-center justify-between gap-3">
          <ol class="flex items-center gap-1.5" :aria-label="t('tour.progress', { n: tourState.index + 1, total })">
            <li
              v-for="(_, i) in tourState.steps"
              :key="i"
              class="h-1.5 rounded-full transition-all"
              :class="i === tourState.index ? 'w-5 bg-bnc-accent' : 'w-1.5 bg-bnc-stone-300 dark:bg-bnc-stone-600'"
            />
          </ol>
          <button
            type="button"
            class="-mr-2 min-h-11 rounded-md px-2 text-xs text-bnc-stone-500 hover:text-bnc-ink dark:hover:text-bnc-paper"
            @click="tour.close()"
          >
            {{ t('tour.skip') }}
          </button>
        </div>

        <div aria-live="polite">
          <h2 class="font-display text-lg font-semibold tracking-tight">{{ step.title }}</h2>
          <p class="mt-1 text-sm leading-relaxed text-bnc-stone-600 dark:text-bnc-stone-300">{{ step.body }}</p>
        </div>

        <div class="flex items-center justify-between gap-2">
          <span class="font-mono text-[11px] tabular-nums text-bnc-stone-500">{{ tourState.index + 1 }} / {{ total }}</span>
          <div class="flex items-center gap-2">
            <button
              v-if="tourState.index > 0"
              type="button"
              class="min-h-11 rounded-md px-3 text-sm font-medium text-bnc-stone-600 hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
              @click="tour.prev()"
            >
              {{ t('tour.prev') }}
            </button>
            <button
              ref="nextBtn"
              type="button"
              class="min-h-11 rounded-md bg-bnc-ink px-4 text-sm font-medium text-bnc-paper transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bnc-accent dark:bg-bnc-paper dark:text-bnc-ink"
              @click="tour.next()"
            >
              {{ isLast ? t('tour.done') : t('tour.next') }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.tour-spot {
  box-shadow:
    0 0 0 2px var(--color-bnc-accent),
    0 0 0 9999px rgba(10, 14, 20, 0.6);
}
.tour-spot-anim {
  transition: top 260ms cubic-bezier(0.16, 1, 0.3, 1), left 260ms cubic-bezier(0.16, 1, 0.3, 1),
    width 260ms cubic-bezier(0.16, 1, 0.3, 1), height 260ms cubic-bezier(0.16, 1, 0.3, 1);
}
.tour-card-anim {
  transition: top 260ms cubic-bezier(0.16, 1, 0.3, 1), left 260ms cubic-bezier(0.16, 1, 0.3, 1);
}
</style>
