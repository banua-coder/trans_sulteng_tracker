<script setup lang="ts">
/**
 * Live trip companion HUD. Replaces TripDetailPanel content while
 * a ride is active. Status-driven content: one big metric + at most
 * one big action. Voice cues do the heavy lifting via
 * useRideAnnouncements, mounted here so the HUD owns its full
 * lifecycle.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useRideStore } from '@/stores/ride'
import { useBrtStore } from '@/stores/brt'
import { useRideAnnouncements } from '@/composables/useRideAnnouncements'
import { useTripShare } from '@/composables/useTripShare'
import SheetStickyHeader from '@/components/SheetStickyHeader.vue'

const { t } = useI18n()
const ride = useRideStore()
const brt = useBrtStore()
const { status, currentStep, distanceToTargetM, isStale, online, state, summary } = storeToRefs(ride)

useRideAnnouncements()
const tripShare = useTripShare()

async function shareTrip() {
  if (!summary.value) return
  await tripShare.share(summary.value)
}

const stepNum = computed(() => state.value.stepIdx + 1)
const stepTotal = computed(() => state.value.plan?.steps.length ?? 0)

// Headline text per status — drives the big top-of-card title.
const title = computed(() => {
  const step = currentStep.value
  switch (status.value) {
    case 'walking':
      return t('ride.hud.walking', { target: step?.toName ?? '—' })
    case 'waiting':
      return t('ride.hud.waiting', { kor: step?.kor ?? '—' })
    case 'on-bus':
      return t('ride.hud.onBus', { target: step?.toName ?? '—' })
    case 'transferring':
      return t('ride.hud.transferring', {
        from: step?.fromName ?? '—',
        to: step?.toName ?? '—',
      })
    case 'arrived':
      return t('ride.hud.arrived', {
        destination: state.value.plan?.steps.at(-1)?.toName ?? '—',
      })
    default:
      return ''
  }
})

const distanceLabel = computed(() => {
  const m = distanceToTargetM.value
  if (m == null) return null
  return t('ride.hud.toGo', { m: Math.round(m) })
})

const korColor = computed(() => {
  const step = currentStep.value
  if (step?.kind === 'ride' && step.kor) return brt.colorForKor(step.kor) || 'var(--color-bnc-accent)'
  return 'var(--color-bnc-stone-400)'
})

const confirming = ref(false)
function askStop() {
  confirming.value = true
}
function cancelStop() {
  confirming.value = false
}
async function confirmStop() {
  confirming.value = false
  await ride.stop()
}

// Total trip duration shown on `arrived` — same source as the cue.
const durationMin = computed(() => {
  const s = state.value.startedAt
  const e = state.value.endedAt ?? Date.now()
  if (!s) return 0
  return Math.max(1, Math.round((e - s) / 60_000))
})
</script>

<template>
  <article
    v-if="status !== 'idle'"
    class="pointer-events-auto flex w-full flex-col gap-3 sm:max-w-sm lg:max-w-md lg:rounded-[var(--radius-md)] lg:border lg:border-bnc-stone-200 lg:bg-white lg:p-4 lg:shadow-[var(--shadow-elevated)] dark:lg:border-bnc-stone-800 dark:lg:bg-bnc-stone-900"
    role="region"
    :aria-label="t('ride.activeBadge')"
  >
    <SheetStickyHeader :back-label="t('ride.stop')" mobile-only @back="askStop">
      <span
        class="grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold text-white"
        :style="{ background: korColor }"
        aria-hidden
      >
        {{ currentStep?.kor || '·' }}
      </span>
      <div class="min-w-0 flex-1">
        <p class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
          {{ t('ride.activeBadge') }} · {{ t('ride.stepOf', { current: stepNum, total: stepTotal }) }}
        </p>
        <h2 class="truncate font-display text-sm font-bold tracking-tight">
          {{ title }}
        </h2>
      </div>
      <button
        type="button"
        class="hidden shrink-0 items-center justify-center rounded-md border border-bnc-stone-300 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 lg:inline-flex dark:border-bnc-stone-700 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
        @click="askStop"
      >
        {{ t('ride.stop') }}
      </button>
    </SheetStickyHeader>

    <!-- Stop confirm popover -->
    <div
      v-if="confirming"
      class="flex items-center gap-2 rounded-md border border-bnc-stone-200 bg-bnc-paper p-2 dark:border-bnc-stone-800 dark:bg-bnc-stone-900"
    >
      <span class="flex-1 text-xs">{{ t('ride.stopConfirm') }}</span>
      <button
        type="button"
        class="rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-bnc-stone-600 hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
        @click="cancelStop"
      >
        {{ t('a11y.back') }}
      </button>
      <button
        type="button"
        class="rounded-md bg-bnc-ink px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white hover:opacity-90 dark:bg-bnc-paper dark:text-bnc-ink"
        @click="confirmStop"
      >
        {{ t('ride.stop') }}
      </button>
    </div>

    <!-- Status banners -->
    <p
      v-if="isStale"
      class="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
      aria-live="polite"
    >
      {{ t('ride.hud.staleGps') }}
    </p>
    <p
      v-if="!online"
      class="rounded-md bg-bnc-stone-100 px-2 py-1.5 text-[11px] text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300"
    >
      {{ t('ride.hud.offline') }}
    </p>

    <!-- Big metric — distance to next target -->
    <div
      v-if="status !== 'arrived'"
      class="flex flex-col items-center justify-center gap-1 rounded-md bg-bnc-stone-50 px-3 py-6 text-center dark:bg-bnc-stone-800/40"
      aria-live="polite"
    >
      <span
        v-if="distanceLabel"
        class="font-mono text-4xl font-extrabold tabular-nums text-bnc-ink dark:text-bnc-paper"
      >
        {{ distanceLabel }}
      </span>
      <span
        v-else
        class="font-mono text-sm text-bnc-stone-500"
      >
        {{ t('ride.hud.staleGps') }}
      </span>
    </div>

    <!-- Arrived: duration recap (Phase 4 will add the share card) -->
    <div
      v-else
      class="flex flex-col items-center gap-1 rounded-md bg-bnc-stone-50 px-3 py-6 text-center dark:bg-bnc-stone-800/40"
    >
      <span class="font-mono text-3xl font-extrabold tabular-nums text-bnc-ink dark:text-bnc-paper">
        {{ durationMin }} {{ t('units.minutes') }}
      </span>
      <p class="text-xs text-bnc-stone-500">
        {{ t('ride.hud.arrived', { destination: state.plan?.steps.at(-1)?.toName ?? '—' }) }}
      </p>
    </div>

    <!-- Status-specific action button -->
    <button
      v-if="status === 'waiting'"
      type="button"
      class="w-full rounded-md bg-bnc-accent px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90"
      @click="ride.confirmBoarded()"
    >
      {{ t('ride.hud.boarded') }}
    </button>
    <button
      v-else-if="status === 'on-bus'"
      type="button"
      class="w-full rounded-md bg-bnc-ink px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90 dark:bg-bnc-paper dark:text-bnc-ink"
      @click="ride.confirmAlighted()"
    >
      {{ t('ride.hud.alighted') }}
    </button>
    <div v-else-if="status === 'arrived'" class="flex gap-2">
      <button
        type="button"
        :disabled="tripShare.busy.value"
        class="flex-1 rounded-md bg-bnc-accent px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        @click="shareTrip"
      >
        {{ tripShare.busy.value ? '…' : t('ride.hud.share') }}
      </button>
      <button
        type="button"
        class="flex-1 rounded-md border border-bnc-stone-300 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bnc-stone-700 transition-colors hover:bg-bnc-stone-100 dark:border-bnc-stone-700 dark:text-bnc-stone-200 dark:hover:bg-bnc-stone-800"
        @click="ride.stop()"
      >
        {{ t('ride.hud.done') }}
      </button>
    </div>
  </article>
</template>
