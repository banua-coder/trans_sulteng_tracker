<script setup lang="ts">
/**
 * Card shown beneath a halte node in the route detail timeline.
 * Mirrors the TJ "estimated arrival" tile — armada code + plate
 * (Indonesian commercial plate badge) + a "Last Stop" / "Next Stop"
 * status pill, and an ETA in minutes pinned to the right.
 *
 * Pure presentational — caller passes the precomputed ETA so the
 * timeline can hoist the heavy ranking work into a single computed.
 */
import { useI18n } from 'vue-i18n'
import PlateBadge from '@/components/PlateBadge.vue'
import { formatDistance } from '@/lib/format'

type Status = 'last' | 'approaching'

const props = defineProps<{
  kor: string
  corridorColor: string
  plate: string | null
  armada: string | null
  etaMin: number | null
  /** Distance to the halte in metres (haversine or upstream). */
  distM?: number | null
  /** Trip progress along the corridor as a percent (0–100). Optional
   *  — Trans Donggala ships it, Trans Palu doesn't. When present the
   *  left accent stripe fills from the bottom up to show how much of
   *  the route the bus has covered. */
  progressPct?: number | null
  /** Last stop name when status='last', else next-stop name. */
  toward: string | null
  /** Wall-clock target arrival, formatted "HH:mm". Optional — TJ
   *  shows both an ETA and the absolute time; we do the same when
   *  the caller computes it. */
  arrivalAt?: string | null
  status: Status
  stale?: boolean
}>()

const { t } = useI18n()

// Linear gradient that fills the stripe from the bottom up to the
// progress %. The unfilled portion drops to ~30% opacity of the
// corridor color, so the stripe still reads as the right route.
function stripeStyle(): Record<string, string> {
  const color = props.corridorColor
  if (props.progressPct == null) {
    return { background: color }
  }
  const pct = Math.max(0, Math.min(100, props.progressPct))
  return {
    background: `linear-gradient(to top, ${color} 0%, ${color} ${pct}%, ${color}33 ${pct}%, ${color}33 100%)`,
  }
}
</script>

<template>
  <div
    class="flex items-stretch gap-3 rounded-[var(--radius-md)] border border-bnc-stone-200 bg-bnc-stone-50 px-3 py-2 dark:border-bnc-stone-800 dark:bg-bnc-stone-800/50"
  >
    <span
      class="grid w-1 shrink-0 rounded-full"
      :style="stripeStyle()"
      :title="progressPct != null ? `${Math.round(progressPct)}%` : undefined"
      aria-hidden
    />

    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex flex-wrap items-center gap-1.5">
        <PlateBadge v-if="plate" :plate="plate" size="sm" />
        <span
          v-if="armada"
          class="inline-flex items-center rounded bg-bnc-stone-200 px-1 py-[1px] font-mono text-[10px] font-bold tracking-wider text-bnc-ink dark:bg-bnc-stone-700 dark:text-bnc-paper"
        >
          {{ armada }}
        </span>
        <span
          v-if="stale"
          class="inline-flex items-center rounded-full bg-bnc-stone-200 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wider text-bnc-stone-500 dark:bg-bnc-stone-700"
        >
          stale
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <span
          class="inline-flex items-center rounded bg-bnc-stone-200 px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wider text-bnc-stone-600 dark:bg-bnc-stone-700 dark:text-bnc-stone-300"
        >
          {{ status === 'last' ? t('route.lastStop') : t('route.nextStop') }}
        </span>
        <span
          v-if="toward"
          class="truncate text-xs text-bnc-stone-700 dark:text-bnc-stone-200"
        >
          {{ toward }}
        </span>
      </div>
    </div>

    <div class="flex shrink-0 flex-col items-end justify-center">
      <span class="font-mono text-[9px] uppercase tracking-wider text-bnc-stone-500">
        {{ t('route.estimatedArrival') }}
      </span>
      <span class="font-mono text-base font-extrabold tabular-nums leading-tight text-bnc-accent">
        <template v-if="etaMin != null">
          {{ Math.max(1, Math.round(etaMin)) }}
          <span class="text-[10px] font-medium text-bnc-stone-500">
            {{ t('units.minutes') }}
          </span>
        </template>
        <template v-else>
          —
        </template>
      </span>
      <span
        v-if="distM != null"
        class="font-mono text-[10px] tabular-nums text-bnc-stone-500"
      >
        {{ formatDistance(distM) }}
      </span>
      <span
        v-if="arrivalAt"
        class="font-mono text-[10px] tabular-nums text-bnc-stone-500"
      >
        {{ arrivalAt }}
      </span>
    </div>
  </div>
</template>
