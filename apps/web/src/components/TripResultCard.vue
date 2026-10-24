<script setup lang="ts">
import { computed, toRef } from 'vue'
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
const steps = toRef(props, 'steps')

const { t } = useI18n()
const brt = useBrtStore()

const wait = computed(() => steps.value.find((st) => st.kind === 'ride' && st.waitMin != null) ?? null)

const duration = computed(() => {
  const m = Math.round(props.totalMin)
  return m >= 60
    ? { value: `${Math.floor(m / 60)} ${t('units.hourShort')} ${m % 60}`, unit: t('units.minutesShort') }
    : { value: String(m), unit: t('units.minutes') }
})

/** Walk and ride legs in order; transfers fold into the arrows. */
const legs = computed(() => {
  const out: { kind: 'walk' | 'ride'; kor: string; min: number }[] = []
  for (const st of steps.value) {
    if (st.kind === 'walk') out.push({ kind: 'walk', kor: '', min: st.durationMin })
    else if (st.kind === 'ride' && st.kor) out.push({ kind: 'ride', kor: st.kor, min: st.durationMin })
  }
  return out
})

const transfers = computed(() => Math.max(0, steps.value.filter((st) => st.kind === 'ride').length - 1))

const totalKm = computed(() => {
  const m = props.totalWalkM + props.totalRideM
  return (m / 1000).toFixed(1)
})
</script>

<template>
  <div
    class="flex cursor-pointer flex-col gap-3 rounded-2xl border bg-white p-4 transition-colors dark:bg-bnc-stone-900"
    :class="isFastest ? 'border-bnc-accent' : 'border-bnc-stone-200 hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:hover:border-bnc-stone-700'"
    role="button"
    tabindex="0"
    @keydown.enter.prevent="($event.currentTarget as HTMLElement).click()"
    @keydown.space.prevent="($event.currentTarget as HTMLElement).click()"
  >
    <div class="flex items-start justify-between gap-2">
      <p class="font-display text-3xl font-semibold tabular-nums tracking-tight text-bnc-ink dark:text-bnc-paper">
        ~{{ duration.value }}<span class="ml-1 text-base font-normal text-bnc-stone-500">{{ duration.unit }}</span>
      </p>
      <span v-if="isFastest" class="pt-1 text-xs font-medium text-bnc-accent">{{ t('trip.fastest') }}</span>
    </div>

    <!-- walk and ride legs in order, arrows between -->
    <div class="flex flex-wrap items-center gap-1.5">
      <template v-for="(leg, i) in legs" :key="i">
        <svg v-if="i > 0" class="h-3.5 w-3.5 shrink-0 text-bnc-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        <span v-if="leg.kind === 'walk'" class="inline-flex h-7 items-center gap-1 rounded-md border border-bnc-stone-300 px-2 text-xs text-bnc-stone-600 dark:border-bnc-stone-700 dark:text-bnc-stone-300">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="1.5" /><path d="M9 14l-1 5M15 14l1 5M8 11l1.5-3.5 2.5 2 2.5-1L17 11" /></svg>
          {{ Math.max(1, Math.round(leg.min)) }}′
        </span>
        <span
          v-else
          class="inline-flex h-7 items-center gap-1.5 rounded-md border-2 px-2 font-mono text-xs font-bold text-bnc-ink dark:text-bnc-paper"
          :style="{ borderColor: brt.colorForKor(leg.kor) }"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="14" rx="3" /><path d="M4 11h16M8 21v-3M16 21v-3" /></svg>
          {{ leg.kor }}
        </span>
      </template>
    </div>

    <p class="text-xs text-bnc-stone-500">
      <template v-if="transfers > 0">{{ t('trip.transfers', { n: transfers }) }} · </template>{{ t('trip.walkTotal', { m: Math.round(totalWalkM / 10) * 10 }) }} · <span class="font-mono">{{ totalKm }} km</span>
    </p>
    <p v-if="wait" class="text-xs" :class="wait.waitLive ? 'font-medium text-bnc-ink dark:text-bnc-paper' : 'text-bnc-stone-500'">
      {{ t(wait.waitLive ? 'trip.waitLive' : 'trip.waitEstimate', { min: Math.max(1, Math.round(wait.waitMin ?? 0)) }) }}
    </p>
  </div>
</template>
