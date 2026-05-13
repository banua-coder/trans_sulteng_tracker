<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { onClickOutside } from '@vueuse/core'
import { useTripStore } from '@/stores/trip'
import { useBrtStore } from '@/stores/brt'
import TripResultCard from '@/components/TripResultCard.vue'
import type { Endpoint } from '@/stores/trip'

const { t } = useI18n()
const trip = useTripStore()
const brt = useBrtStore()
const { origin, destination, plans, loading, error } = storeToRefs(trip)

// ── Origin search ──────────────────────────────────────────────────────────
const originQuery = ref('')
const originFocused = ref(false)
const originPopoverEl = ref<HTMLElement | null>(null)
const gpsLoading = ref(false)
const gpsError = ref(false)

onClickOutside(originPopoverEl, () => {
  originFocused.value = false
})

const originResults = computed(() => {
  const q = originQuery.value.trim().toLowerCase()
  if (!q) return []
  return brt.halte
    .filter((h) => h.sh_name.toLowerCase().includes(q))
    .slice(0, 8)
})

function pickOriginHalte(h: (typeof brt.halte)[number]) {
  trip.setOrigin({
    kind: 'halte',
    label: h.sh_name,
    point: { lat: parseFloat(h.sh_lat), lng: parseFloat(h.sh_lng) },
    sh_id: h.sh_id,
  } satisfies Endpoint)
  originQuery.value = ''
  originFocused.value = false
}

function clearOrigin() {
  trip.setOrigin(null)
  originQuery.value = ''
}

function useGps() {
  gpsError.value = false
  gpsLoading.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      gpsLoading.value = false
      trip.setOrigin({
        kind: 'gps',
        label: t('trip.useGps'),
        point: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        sh_id: null,
      })
    },
    () => {
      gpsLoading.value = false
      gpsError.value = true
    },
    { timeout: 10_000 },
  )
}

// ── Destination search ─────────────────────────────────────────────────────
const destQuery = ref('')
const destFocused = ref(false)
const destPopoverEl = ref<HTMLElement | null>(null)

onClickOutside(destPopoverEl, () => {
  destFocused.value = false
})

const destResults = computed(() => {
  const q = destQuery.value.trim().toLowerCase()
  if (!q) return []
  return brt.halte
    .filter((h) => h.sh_name.toLowerCase().includes(q))
    .slice(0, 8)
})

function pickDestHalte(h: (typeof brt.halte)[number]) {
  trip.setDestination({
    kind: 'halte',
    label: h.sh_name,
    point: { lat: parseFloat(h.sh_lat), lng: parseFloat(h.sh_lng) },
    sh_id: h.sh_id,
  } satisfies Endpoint)
  destQuery.value = ''
  destFocused.value = false
}

function clearDest() {
  trip.setDestination(null)
  destQuery.value = ''
}

// ── Plans ──────────────────────────────────────────────────────────────────
const fastestIdx = computed(() => {
  if (!plans.value.length) return null
  let idx = 0
  for (let i = 1; i < plans.value.length; i++) {
    if (plans.value[i].totalMin < plans.value[idx].totalMin) idx = i
  }
  return idx
})

const showNoResults = computed(
  () => !loading.value && !error.value && plans.value.length === 0 && origin.value && destination.value,
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Origin row -->
    <div ref="originPopoverEl" class="relative flex items-center gap-2">
      <!-- GPS button -->
      <button
        type="button"
        class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
        :aria-label="t('trip.useGps')"
        :title="t('trip.useGps')"
        @click="useGps"
      >
        <!-- spinner while waiting -->
        <svg
          v-if="gpsLoading"
          class="h-4 w-4 animate-spin text-bnc-accent"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden
        >
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
        <!-- GPS icon -->
        <svg
          v-else
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden
        >
          <path d="M12 2a10 10 0 1 0 10 10" />
          <circle cx="12" cy="12" r="3" />
          <path d="M22 2l-7 7" />
          <path d="M16 2h6v6" />
        </svg>
      </button>

      <!-- GPS error inline -->
      <p v-if="gpsError" class="flex-1 text-xs text-red-500">{{ t('trip.gpsFailed') }}</p>

      <!-- Chip when origin set -->
      <template v-else-if="origin">
        <span class="flex flex-1 items-center gap-1.5 rounded-full bg-bnc-stone-100 px-3 py-1.5 text-sm dark:bg-bnc-stone-800">
          <svg class="h-3 w-3 shrink-0 text-bnc-accent" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          <span class="min-w-0 flex-1 truncate font-display text-sm font-medium">{{ origin.label }}</span>
          <button
            type="button"
            class="ml-1 shrink-0 rounded-full p-0.5 text-bnc-stone-500 transition-colors hover:bg-bnc-stone-200 hover:text-bnc-ink dark:hover:bg-bnc-stone-700 dark:hover:text-bnc-paper"
            :aria-label="t('trip.clear')"
            @click="clearOrigin"
          >
            <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </span>
      </template>

      <!-- Search input -->
      <input
        v-else
        v-model="originQuery"
        type="text"
        autocomplete="off"
        :placeholder="t('trip.originPlaceholder')"
        class="flex-1 rounded-[var(--radius-md)] border border-bnc-stone-200 bg-bnc-stone-50 px-3 py-2 text-sm placeholder:text-bnc-stone-400 focus:border-bnc-accent focus:outline-none dark:border-bnc-stone-800 dark:bg-bnc-stone-800"
        @focus="originFocused = true"
      />

      <!-- Origin popover -->
      <ul
        v-if="originFocused && originResults.length"
        class="absolute left-10 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-[var(--radius-md)] border border-bnc-stone-200 bg-white shadow-md dark:border-bnc-stone-700 dark:bg-bnc-stone-900"
      >
        <li v-for="h in originResults" :key="h.sh_id">
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bnc-stone-50 dark:hover:bg-bnc-stone-800"
            @click="pickOriginHalte(h)"
          >
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              :style="{ background: brt.colorForKor(h.kor) }"
              aria-hidden
            />
            <span class="min-w-0 flex-1 truncate text-sm">{{ h.sh_name }}</span>
            <span class="shrink-0 font-mono text-[10px] text-bnc-stone-400">{{ h.kor }}</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Swap button -->
    <div class="flex items-center gap-2">
      <div class="ml-4 h-px flex-1 bg-bnc-stone-100 dark:bg-bnc-stone-800" aria-hidden />
      <button
        type="button"
        class="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-bnc-stone-200 bg-white text-bnc-stone-600 transition-colors hover:border-bnc-stone-300 hover:bg-bnc-stone-50 dark:border-bnc-stone-700 dark:bg-bnc-stone-900 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
        :aria-label="t('trip.swap')"
        :title="t('trip.swap')"
        @click="trip.swap()"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
          <path d="M17 3l4 4-4 4" />
          <path d="M3 7h18" />
          <path d="M7 21l-4-4 4-4" />
          <path d="M21 17H3" />
        </svg>
      </button>
      <div class="mr-0 h-px flex-1 bg-bnc-stone-100 dark:bg-bnc-stone-800" aria-hidden />
    </div>

    <!-- Destination row -->
    <div ref="destPopoverEl" class="relative flex items-center gap-2">
      <!-- Pin icon (visual alignment placeholder) -->
      <span class="grid h-8 w-8 shrink-0 place-items-center text-bnc-stone-400" aria-hidden>
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </span>

      <!-- Chip when destination set -->
      <template v-if="destination">
        <span class="flex flex-1 items-center gap-1.5 rounded-full bg-bnc-stone-100 px-3 py-1.5 text-sm dark:bg-bnc-stone-800">
          <svg class="h-3 w-3 shrink-0 text-bnc-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          <span class="min-w-0 flex-1 truncate font-display text-sm font-medium">{{ destination.label }}</span>
          <button
            type="button"
            class="ml-1 shrink-0 rounded-full p-0.5 text-bnc-stone-500 transition-colors hover:bg-bnc-stone-200 hover:text-bnc-ink dark:hover:bg-bnc-stone-700 dark:hover:text-bnc-paper"
            :aria-label="t('trip.clear')"
            @click="clearDest"
          >
            <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </span>
      </template>

      <!-- Search input -->
      <input
        v-else
        v-model="destQuery"
        type="text"
        autocomplete="off"
        :placeholder="t('trip.destinationPlaceholder')"
        class="flex-1 rounded-[var(--radius-md)] border border-bnc-stone-200 bg-bnc-stone-50 px-3 py-2 text-sm placeholder:text-bnc-stone-400 focus:border-bnc-accent focus:outline-none dark:border-bnc-stone-800 dark:bg-bnc-stone-800"
        @focus="destFocused = true"
      />

      <!-- Destination popover -->
      <ul
        v-if="destFocused && destResults.length"
        class="absolute left-10 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-[var(--radius-md)] border border-bnc-stone-200 bg-white shadow-md dark:border-bnc-stone-700 dark:bg-bnc-stone-900"
      >
        <li v-for="h in destResults" :key="h.sh_id">
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bnc-stone-50 dark:hover:bg-bnc-stone-800"
            @click="pickDestHalte(h)"
          >
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              :style="{ background: brt.colorForKor(h.kor) }"
              aria-hidden
            />
            <span class="min-w-0 flex-1 truncate text-sm">{{ h.sh_name }}</span>
            <span class="shrink-0 font-mono text-[10px] text-bnc-stone-400">{{ h.kor }}</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Results section -->
    <div class="mt-1 flex flex-col gap-2">
      <!-- Loading -->
      <div v-if="loading" class="flex items-center gap-2 py-2 text-sm text-bnc-stone-500">
        <svg class="h-4 w-4 animate-spin text-bnc-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
        {{ t('trip.searching') }}
      </div>

      <!-- Error -->
      <p v-else-if="error" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
        {{ error }}
      </p>

      <!-- No results -->
      <p
        v-else-if="showNoResults"
        class="rounded-md bg-bnc-stone-100 px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500 dark:bg-bnc-stone-800"
      >
        {{ t('trip.noResults') }}
      </p>

      <!-- Plan cards -->
      <template v-else>
        <TripResultCard
          v-for="(plan, idx) in plans"
          :key="idx"
          :total-min="plan.totalMin"
          :total-walk-m="plan.totalWalkM"
          :total-ride-m="plan.totalRideM"
          :steps="plan.steps"
          :is-fastest="idx === fastestIdx"
          @click="trip.selectPlan(idx)"
        />
      </template>
    </div>
  </div>
</template>
