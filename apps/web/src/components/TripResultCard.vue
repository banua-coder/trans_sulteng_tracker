<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBrtStore } from '@/stores/brt'
import type { PlanStep } from '@/lib/tripPlanner'

const props = defineProps<{
  totalMin: number
  totalWalkM: number
  totalRideM: number
  steps: PlanStep[]
  isFastest?: boolean
}>()

const { t } = useI18n()
const brt = useBrtStore()

const totalKm = computed(() => {
  const m = props.totalWalkM + props.totalRideM
  return (m / 1000).toFixed(1)
})
</script>

<template>
  <div
    class="flex cursor-pointer flex-col gap-2 rounded-[var(--radius-md)] border border-bnc-stone-200 bg-white p-3 transition-colors hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-900 dark:hover:border-bnc-stone-700"
    role="button"
    tabindex="0"
  >
    <!-- top row: time + step chain -->
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="font-mono text-xl font-bold tabular-nums text-bnc-ink dark:text-bnc-paper">
          {{ Math.round(totalMin) }}<span class="ml-1 text-sm font-normal text-bnc-stone-500">{{ t('units.minutes') }}</span>
        </p>
      </div>
      <!-- step chain icons -->
      <div class="flex items-center gap-1 pt-0.5">
        <template v-for="(step, i) in steps" :key="i">
          <!-- walk -->
          <template v-if="step.kind === 'walk'">
            <svg class="h-3.5 w-3.5 shrink-0 text-bnc-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
              <circle cx="12" cy="5" r="1.5" />
              <path d="M9 14l-1 5M15 14l1 5M8 11l1.5-3.5 2.5 2 2.5-1L17 11" />
            </svg>
          </template>
          <!-- transfer -->
          <template v-else-if="step.kind === 'transfer'">
            <svg class="h-3.5 w-3.5 shrink-0 text-bnc-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
              <path d="M17 1l4 4-4 4" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <path d="M7 23l-4-4 4-4" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </template>
          <!-- ride -->
          <template v-else-if="step.kind === 'ride' && step.kor">
            <span
              class="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold text-white"
              :style="{ background: brt.colorForKor(step.kor) }"
              :aria-label="step.kor"
            >
              {{ step.kor }}
            </span>
          </template>
        </template>
      </div>
    </div>

    <hr class="border-bnc-stone-100 dark:border-bnc-stone-800" />

    <!-- bottom row: distance + fastest badge -->
    <div class="flex items-center justify-between gap-2">
      <span class="font-mono text-xs text-bnc-stone-500">{{ totalKm }} km</span>
      <span
        v-if="isFastest"
        class="rounded-full bg-yellow-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
      >
        {{ t('trip.fastest') }}
      </span>
    </div>
  </div>
</template>
