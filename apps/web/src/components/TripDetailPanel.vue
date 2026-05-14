<script setup lang="ts">
/**
 * Trip detail — full itinerary view shown after the user taps a
 * TripResultCard. Uses the same sticky-header pattern as
 * MobileRouteDetailPanel so the back button + summary chips stay
 * visible while the step timeline scrolls.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useTripStore } from '@/stores/trip'
import { useBrtStore } from '@/stores/brt'
import CopyLinkButton from '@/components/CopyLinkButton.vue'
import type { PlanStep } from '@/lib/tripPlanner'

const { t } = useI18n()
const trip = useTripStore()
const brt = useBrtStore()
const { selectedPlan, origin, destination } = storeToRefs(trip)

function back() {
  trip.selectPlan(null)
}

function colorForStep(step: PlanStep): string {
  if (step.kind === 'ride' && step.kor) return brt.colorForKor(step.kor) || 'var(--color-bnc-accent)'
  if (step.kind === 'transfer') return 'var(--color-warn)'
  return 'var(--color-bnc-stone-400)'
}

const totalKm = computed(() => {
  if (!selectedPlan.value) return 0
  return (selectedPlan.value.totalWalkM + selectedPlan.value.totalRideM) / 1000
})

/** Number each unique boarding/alighting halte in encounter order —
 *  exactly the same dedupe rule MapView's drawTripPreview uses, so
 *  the number shown in the timeline matches the red disc on the map.
 *  Returns a map: step index → assigned number (or null if the step
 *  isn't tied to a numbered point). */
const stepNumbers = computed(() => {
  const out = new Map<number, number>()
  if (!selectedPlan.value) return out
  const seen = new Map<string, number>()
  let counter = 1
  // First pass: assign numbers to every distinct boarding/alighting
  // halte name (only ride steps drive numbering — walk legs to the
  // destination don't get a numbered map marker).
  for (const step of selectedPlan.value.steps) {
    if (step.kind !== 'ride') continue
    if (!seen.has(step.fromName)) seen.set(step.fromName, counter++)
    if (!seen.has(step.toName)) seen.set(step.toName, counter++)
  }
  // Second pass: each step row gets the number of its "you arrive
  // here" endpoint — toName for rides + walks-to-halte, fromName for
  // transfers (the transfer point is the halte you just arrived at).
  for (let i = 0; i < selectedPlan.value.steps.length; i++) {
    const step = selectedPlan.value.steps[i]
    if (step.kind === 'ride') {
      const n = seen.get(step.toName)
      if (n != null) out.set(i, n)
    } else if (step.kind === 'transfer') {
      const n = seen.get(step.fromName) ?? seen.get(step.toName)
      if (n != null) out.set(i, n)
    } else if (step.kind === 'walk') {
      const n = seen.get(step.toName)
      if (n != null) out.set(i, n)
    }
  }
  return out
})

function coordForName(name: string, kor: string | undefined): { lat: number; lng: number } | null {
  const h = (kor && brt.halte.find((x) => x.sh_name === name && x.kor === kor))
    ?? brt.halte.find((x) => x.sh_name === name)
  if (!h) return null
  const lat = parseFloat(h.sh_lat)
  const lng = parseFloat(h.sh_lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function focusStep(step: PlanStep) {
  // For rides, zoom to alighting (the destination of that segment).
  // For transfers, zoom to the transfer point itself. For walk-out
  // (toName === destination's label), zoom to the destination pin.
  if (step.kind === 'walk' && step.toName === destination.value?.label) {
    if (destination.value?.point) trip.focusStop(destination.value.point)
    return
  }
  const name = step.kind === 'transfer' ? step.fromName : step.toName
  const c = coordForName(name, step.kor)
  if (c) trip.focusStop(c)
}
</script>

<template>
  <article v-if="selectedPlan" class="flex flex-col gap-3">
    <!-- Sticky header on mobile -->
    <div
      class="sticky -top-1 z-20 -mx-4 flex flex-col gap-2 bg-bnc-paper px-4 pb-3 pt-2 shadow-[0_4px_8px_-6px_rgba(10,14,20,0.12)] dark:bg-bnc-stone-900 lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:shadow-none dark:lg:bg-transparent"
    >
      <header class="flex items-center gap-2">
        <button
          type="button"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
          :aria-label="t('a11y.back')"
          @click="back"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div class="min-w-0 flex-1">
          <p class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
            {{ t('trip.itineraryTitle') }}
          </p>
          <h2 class="truncate font-display text-sm font-bold tracking-tight">
            {{ origin?.label ?? '—' }} → {{ destination?.label ?? '—' }}
          </h2>
        </div>
        <CopyLinkButton />
      </header>

      <!-- summary chips -->
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="inline-flex items-center gap-1 rounded-full bg-bnc-stone-100 px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300">
          <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          {{ Math.round(selectedPlan.totalMin) }} {{ t('units.minutes') }}
        </span>
        <span class="inline-flex items-center gap-1 rounded-full bg-bnc-stone-100 px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300">
          {{ totalKm.toFixed(1) }} km
        </span>
      </div>
    </div>

    <!-- Step timeline -->
    <ol class="flex flex-col">
      <li
        v-for="(step, idx) in selectedPlan.steps"
        :key="idx"
        class="group relative flex cursor-pointer gap-3 pb-3 transition-colors hover:bg-bnc-stone-100/50 dark:hover:bg-bnc-stone-800/30"
        @click="focusStep(step)"
      >
        <!-- Rail + node dot. When this step has a numbered waypoint
             on the map, render the number inside the dot so the user
             can correlate timeline ↔ map marker at a glance. -->
        <div class="relative flex w-6 shrink-0 flex-col items-center">
          <span
            v-if="stepNumbers.get(idx) != null"
            class="z-10 grid h-5 w-5 place-items-center rounded-full border-2 border-white font-mono text-[10px] font-bold tabular-nums text-white shadow-sm dark:border-bnc-stone-900"
            :style="{ background: colorForStep(step) }"
          >
            {{ stepNumbers.get(idx) }}
          </span>
          <span
            v-else
            class="z-10 h-3 w-3 rounded-full border-2 border-white dark:border-bnc-stone-900"
            :style="{ background: colorForStep(step) }"
            aria-hidden
          />
          <!-- vertical connector line, hidden on last -->
          <span
            v-if="idx < selectedPlan.steps.length - 1"
            class="absolute left-1/2 top-5 h-full w-0.5 -translate-x-1/2"
            :style="{ background: step.kind === 'walk' ? 'transparent' : colorForStep(step) }"
            aria-hidden
          >
            <!-- For walk steps render a dashed line via repeating gradient -->
            <span
              v-if="step.kind === 'walk'"
              class="absolute inset-0 bg-[length:2px_6px] bg-[repeating-linear-gradient(to_bottom,var(--color-bnc-stone-400)_0_2px,transparent_2px_6px)]"
              aria-hidden
            />
          </span>
        </div>

        <!-- Step body -->
        <div class="min-w-0 flex-1">
          <!-- Walk -->
          <template v-if="step.kind === 'walk'">
            <p class="flex items-center gap-1.5 text-sm font-medium">
              <svg class="h-3.5 w-3.5 text-bnc-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
                <circle cx="13" cy="4" r="2" />
                <path d="M9 21l2-6 3-3-2-4-3 3-3 0M14 21l2-7 4-3" />
              </svg>
              {{ t('trip.walkTo') }} {{ step.toName }}
            </p>
            <p class="mt-0.5 font-mono text-[10px] tabular-nums text-bnc-stone-500">
              {{ Math.max(1, Math.round(step.durationMin)) }} {{ t('units.minutes') }}
              <template v-if="step.distM"> · {{ (step.distM / 1000).toFixed(2) }} km</template>
            </p>
          </template>

          <!-- Ride -->
          <template v-else-if="step.kind === 'ride'">
            <p class="flex flex-wrap items-center gap-1.5 text-sm font-medium">
              <span
                class="inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
                :style="{ background: colorForStep(step) }"
              >
                {{ step.kor }}
              </span>
              <span class="truncate">{{ step.fromName }} → {{ step.toName }}</span>
            </p>
            <p class="mt-0.5 font-mono text-[10px] tabular-nums text-bnc-stone-500">
              {{ Math.max(1, Math.round(step.durationMin)) }} {{ t('units.minutes') }}
              <template v-if="step.distM"> · {{ (step.distM / 1000).toFixed(2) }} km</template>
            </p>
          </template>

          <!-- Transfer -->
          <template v-else>
            <p class="flex items-center gap-1.5 text-sm font-medium">
              <svg class="h-3.5 w-3.5" :style="{ color: 'var(--color-warn)' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
                <path d="M17 3l4 4-4 4" />
                <path d="M3 7h18" />
                <path d="M7 21l-4-4 4-4" />
                <path d="M21 17H3" />
              </svg>
              {{ t('trip.transfer') }}
            </p>
            <p class="mt-0.5 font-mono text-[10px] tabular-nums text-bnc-stone-500">
              ≈ {{ Math.round(step.durationMin) }} {{ t('units.minutes') }}
            </p>
          </template>
        </div>
      </li>
    </ol>
  </article>
</template>
