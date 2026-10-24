<script setup lang="ts">
import { onColor } from '@/lib/color'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { onClickOutside, useEventListener } from '@vueuse/core'
import { useTripStore } from '@/stores/trip'
import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import TripResultCard from '@/components/TripResultCard.vue'
import type { Endpoint } from '@/stores/trip'
import { korCity, korLabel } from '@/lib/crossCity'

const { t } = useI18n()
const trip = useTripStore()
const brt = useBrtStore()
const city = useCityStore()
const { origin, destination, plans, loading, error, tapMode } = storeToRefs(trip)

/** Per-city service-area bounding box. GPS reads outside this box
 *  trigger a 'you are not in the service area' warning rather than
 *  silently setting a useless origin. Boxes are generous (~10 km
 *  padding around the actual corridor coverage). */
const CITY_BBOX: Record<string, { south: number; north: number; west: number; east: number }> = {
  '12': { south: -1.05, north: -0.65, west: 119.70, east: 120.00 }, // Palu
  '11': { south: -1.05, north: -0.55, west: 119.55, east: 119.95 }, // Donggala
}

function isInServiceArea(lat: number, lng: number): boolean {
  const bb = CITY_BBOX[city.pref]
  if (!bb) return true
  return lat >= bb.south && lat <= bb.north && lng >= bb.west && lng <= bb.east
}

const gpsOutOfRange = ref(false)

function toggleTapMode(which: 'origin' | 'dest') {
  trip.setTapMode(tapMode.value === which ? null : which)
}

// ── Popover positioning ────────────────────────────────────────────────────
// Search popovers are Teleported to <body> so they can escape the
// bottom sheet's `overflow-y-auto` clip + height cap (the previous
// in-flow version was being cropped by the parent sheet).
interface PopoverRect { top: number; left: number; width: number }

function rectBelow(anchor: HTMLElement | null): PopoverRect {
  if (!anchor) return { top: 0, left: 0, width: 0 }
  const r = anchor.getBoundingClientRect()
  // Align to the whole A/B card, not just the input.
  const card = anchor.closest('[data-plan-card]')?.getBoundingClientRect() ?? r
  return { top: r.bottom + 4, left: card.left, width: card.width }
}

/** A stop is listed once per corridor and direction; show it once. */
function uniqueByName<T extends { sh_name: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((r) => (seen.has(r.sh_name) ? false : (seen.add(r.sh_name), true)))
}

// ── Origin search ──────────────────────────────────────────────────────────
const originQuery = ref('')
const originFocused = ref(false)
const originRowEl = ref<HTMLElement | null>(null)
const originInputEl = ref<HTMLElement | null>(null)
const originPopoverEl = ref<HTMLElement | null>(null)
const originPopoverRect = ref<PopoverRect>({ top: 0, left: 0, width: 0 })
const gpsLoading = ref(false)
const gpsError = ref(false)

onClickOutside(originPopoverEl, (event) => {
  // Don't fight a click that landed on the input itself.
  if (originInputEl.value && originInputEl.value.contains(event.target as Node)) return
  originFocused.value = false
})

function syncOriginRect() {
  originPopoverRect.value = rectBelow(originInputEl.value)
}
// Search covers both cities, so load the other one up front.
watch(() => city.pref, () => { trip.ensureForeign() }, { immediate: true })

watch(originFocused, (v) => {
  if (v) nextTick(syncOriginRect)
})

const originResults = computed(() => {
  const q = originQuery.value.trim().toLowerCase()
  if (!q) return []
  return uniqueByName(brt.planHalte.filter((h) => h.sh_name.toLowerCase().includes(q))).slice(0, 8)
})

function pickOriginHalte(h: (typeof brt.planHalte)[number]) {
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
  // A stale error from a previous failed GPS attempt would otherwise
  // keep covering the chip slot once the user picks a new origin.
  gpsError.value = false
}

function useGps() {
  gpsError.value = false
  gpsLoading.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      gpsLoading.value = false
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      if (!isInServiceArea(lat, lng)) {
        gpsOutOfRange.value = true
        return
      }
      // Snap to the nearest halte — transit planning needs a halte
      // node to route from, and GPS reads are rarely on a stop
      // pixel-exactly. The user's GPS coord is preserved in the chip
      // label so they see roughly where they were located.
      const h = brt.nearestHalte(lat, lng)
      if (h) {
        trip.setOrigin({
          kind: 'halte',
          label: h.sh_name,
          point: { lat: parseFloat(h.sh_lat), lng: parseFloat(h.sh_lng) },
          sh_id: h.sh_id,
        })
      } else {
        trip.setOrigin({
          kind: 'gps',
          label: t('trip.useGps'),
          point: { lat, lng },
          sh_id: null,
        })
      }
    },
    () => {
      gpsLoading.value = false
      gpsError.value = true
    },
    // enableHighAccuracy + a 60s cache match the geo store
    // (MyLocationButton) options. Without `maximumAge` the spec
    // defaults to 0, forcing the browser to spin the GPS hardware
    // fresh every call — on iOS Safari and Android Chrome the
    // second tap in close succession fails because the chip is
    // still warm from the previous request. A 60s cache window
    // lets the second tap reuse a recent fix.
    { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
  )
}

// ── Destination search ─────────────────────────────────────────────────────
const destQuery = ref('')
const destFocused = ref(false)
const destInputEl = ref<HTMLElement | null>(null)
const destPopoverEl = ref<HTMLElement | null>(null)
const destPopoverRect = ref<PopoverRect>({ top: 0, left: 0, width: 0 })

onClickOutside(destPopoverEl, (event) => {
  if (destInputEl.value && destInputEl.value.contains(event.target as Node)) return
  destFocused.value = false
})

function syncDestRect() {
  destPopoverRect.value = rectBelow(destInputEl.value)
}
watch(destFocused, (v) => {
  if (v) nextTick(syncDestRect)
})

// Keep popover positions in sync with scroll / resize while open.
function syncAll() {
  if (originFocused.value) syncOriginRect()
  if (destFocused.value) syncDestRect()
}
useEventListener('scroll', syncAll, { passive: true, capture: true })
useEventListener('resize', syncAll)

const destResults = computed(() => {
  const q = destQuery.value.trim().toLowerCase()
  if (!q) return []
  return uniqueByName(brt.planHalte.filter((h) => h.sh_name.toLowerCase().includes(q))).slice(0, 8)
})

function pickDestHalte(h: (typeof brt.planHalte)[number]) {
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
  <div class="flex flex-col gap-4">
    <div>
      <h2 class="font-display text-2xl font-semibold tracking-tight">{{ t('trip.heading') }}</h2>
      <p class="mt-1 text-sm text-bnc-stone-600 dark:text-bnc-stone-300">{{ t('trip.subheading') }}</p>
    </div>

    <!-- Origin and destination in one card, swap on the right edge -->
    <div data-plan-card class="relative rounded-2xl border border-bnc-stone-200 bg-white dark:border-bnc-stone-800 dark:bg-bnc-stone-900">
      <div ref="originRowEl" class="flex min-w-0 items-center gap-3 px-4 py-3 pr-16">
        <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-bnc-accent font-mono text-xs font-bold text-bnc-accent" aria-hidden="true">A</span>
        <label class="min-w-0 flex-1">
          <span class="block text-xs font-medium text-bnc-stone-500">{{ t('trip.from') }}</span>
          <span v-if="origin" class="flex items-center gap-1">
            <span class="min-w-0 flex-1 [overflow-wrap:anywhere] font-display text-sm font-semibold">{{ origin.label }}</span>
            <button type="button" class="-my-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-bnc-stone-500 hover:bg-bnc-stone-100 dark:hover:bg-bnc-stone-800" :aria-label="t('trip.clear')" @click="clearOrigin">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </span>
          <input
            v-else
            ref="originInputEl"
            v-model="originQuery"
            type="text"
            autocomplete="off"
            :placeholder="t('trip.pickFrom')"
            class="block w-full bg-transparent py-1 text-sm placeholder:text-bnc-stone-400 focus:outline-none"
            @focus="originFocused = true"
          />
        </label>
      </div>
      <p v-if="gpsError && !origin" class="flex items-center gap-2 px-4 pb-2 text-xs text-red-600 dark:text-red-400">
        {{ t('trip.gpsFailed') }}
        <button type="button" class="min-h-11 rounded-md px-2 font-medium underline underline-offset-2 hover:bg-bnc-stone-100 dark:hover:bg-bnc-stone-800" @click="useGps">{{ t('errors.retry') }}</button>
      </p>

      <hr class="border-bnc-stone-200 dark:border-bnc-stone-800" />

      <div class="flex min-w-0 items-center gap-3 px-4 py-3 pr-16">
        <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-bnc-stone-400 font-mono text-xs font-bold text-bnc-stone-500" aria-hidden="true">B</span>
        <label class="min-w-0 flex-1">
          <span class="block text-xs font-medium text-bnc-stone-500">{{ t('trip.to') }}</span>
          <span v-if="destination" class="flex items-center gap-1">
            <span class="min-w-0 flex-1 [overflow-wrap:anywhere] font-display text-sm font-semibold">{{ destination.label }}</span>
            <button type="button" class="-my-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-bnc-stone-500 hover:bg-bnc-stone-100 dark:hover:bg-bnc-stone-800" :aria-label="t('trip.clear')" @click="clearDest">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </span>
          <input
            v-else
            ref="destInputEl"
            v-model="destQuery"
            type="text"
            autocomplete="off"
            :placeholder="t('trip.pickTo')"
            class="block w-full bg-transparent py-1 text-sm placeholder:text-bnc-stone-400 focus:outline-none"
            @focus="destFocused = true"
          />
        </label>
      </div>

      <button
        type="button"
        class="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl border border-bnc-stone-200 bg-white text-bnc-stone-700 shadow-sm hover:bg-bnc-stone-50 dark:border-bnc-stone-700 dark:bg-bnc-stone-900 dark:text-bnc-stone-200 dark:hover:bg-bnc-stone-800"
        :aria-label="t('trip.swap')"
        @click="trip.swap()"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" /></svg>
      </button>
    </div>

    <!-- Origin suggestions: shortcuts first, then matching stops -->
    <Teleport to="body">
      <div
        v-if="originFocused && !origin"
        ref="originPopoverEl"
        class="fixed z-[1200] overflow-hidden rounded-xl border border-bnc-stone-200 bg-white shadow-[var(--shadow-elevated)] dark:border-bnc-stone-700 dark:bg-bnc-stone-900"
        :style="{ top: originPopoverRect.top + 'px', left: originPopoverRect.left + 'px', width: originPopoverRect.width + 'px' }"
        role="listbox"
      >
        <button type="button" class="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-medium text-bnc-accent hover:bg-bnc-stone-50 dark:hover:bg-bnc-stone-800" @click="useGps(); originFocused = false">
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="8" /></svg>
          {{ gpsLoading ? t('trip.locating') : t('trip.useGpsNow') }}
        </button>
        <button type="button" class="flex min-h-11 w-full items-center gap-3 border-t border-bnc-stone-100 px-4 text-left text-sm font-medium text-bnc-accent hover:bg-bnc-stone-50 dark:border-bnc-stone-800 dark:hover:bg-bnc-stone-800" @click="toggleTapMode('origin'); originFocused = false">
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
          {{ t('trip.pickOnMap') }}
        </button>
        <p v-if="!originQuery.trim()" class="border-t border-bnc-stone-100 px-4 py-3 text-xs text-bnc-stone-500 dark:border-bnc-stone-800">{{ t('trip.typeToSearch') }}</p>
        <button
          v-for="h in originResults"
          :key="h.sh_id"
          type="button"
          role="option"
          class="flex min-h-11 w-full items-center gap-3 border-t border-bnc-stone-100 px-4 py-2 text-left text-sm hover:bg-bnc-stone-50 dark:border-bnc-stone-800 dark:hover:bg-bnc-stone-800"
          @click="pickOriginHalte(h)"
        >
          <span class="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold" :style="{ background: brt.colorForKor(h.kor), color: onColor(brt.colorForKor(h.kor)) }">{{ korLabel(h.kor) }}</span>
          <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">{{ h.sh_name }}</span>
          <span v-if="korCity(h.kor)" class="shrink-0 text-xs text-bnc-stone-500">{{ korCity(h.kor) }}</span>
        </button>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="destFocused && !destination"
        ref="destPopoverEl"
        class="fixed z-[1200] overflow-hidden rounded-xl border border-bnc-stone-200 bg-white shadow-[var(--shadow-elevated)] dark:border-bnc-stone-700 dark:bg-bnc-stone-900"
        :style="{ top: destPopoverRect.top + 'px', left: destPopoverRect.left + 'px', width: destPopoverRect.width + 'px' }"
        role="listbox"
      >
        <button type="button" class="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-medium text-bnc-accent hover:bg-bnc-stone-50 dark:hover:bg-bnc-stone-800" @click="toggleTapMode('dest'); destFocused = false">
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
          {{ t('trip.pickOnMap') }}
        </button>
        <p v-if="!destQuery.trim()" class="border-t border-bnc-stone-100 px-4 py-3 text-xs text-bnc-stone-500 dark:border-bnc-stone-800">{{ t('trip.typeToSearch') }}</p>
        <button
          v-for="h in destResults"
          :key="h.sh_id"
          type="button"
          role="option"
          class="flex min-h-11 w-full items-center gap-3 border-t border-bnc-stone-100 px-4 py-2 text-left text-sm hover:bg-bnc-stone-50 dark:border-bnc-stone-800 dark:hover:bg-bnc-stone-800"
          @click="pickDestHalte(h)"
        >
          <span class="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold" :style="{ background: brt.colorForKor(h.kor), color: onColor(brt.colorForKor(h.kor)) }">{{ korLabel(h.kor) }}</span>
          <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">{{ h.sh_name }}</span>
          <span v-if="korCity(h.kor)" class="shrink-0 text-xs text-bnc-stone-500">{{ korCity(h.kor) }}</span>
        </button>
      </div>
    </Teleport>

    <!-- Tapping the map is active -->
    <p v-if="tapMode" class="rounded-xl bg-bnc-accent/10 px-4 py-3 text-sm text-bnc-ink dark:text-bnc-paper">
      {{ t(tapMode === 'origin' ? 'trip.tapHintOrigin' : 'trip.tapHintDest') }}
    </p>

    <!-- Results -->
    <div v-if="origin && destination" class="flex flex-col gap-3" aria-live="polite">
      <div v-if="loading" class="flex items-center gap-2 py-2 text-sm text-bnc-stone-500">
        <svg class="h-4 w-4 animate-spin text-bnc-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
        {{ t('trip.searching') }}
      </div>
      <p v-else-if="error" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">{{ error }}</p>
      <p v-else-if="showNoResults" class="rounded-xl bg-bnc-stone-100 px-4 py-3 text-sm text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300">{{ t('trip.noResults') }}</p>
      <template v-else>
        <div class="flex items-center justify-between">
          <h3 class="font-display text-base font-semibold">{{ t('trip.available') }}</h3>
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-bnc-accent hover:bg-bnc-stone-100 dark:hover:bg-bnc-stone-800"
            @click="trip.recompute()"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
            {{ t('trip.recompute') }}
          </button>
        </div>
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

    <!-- GPS out-of-range dialog. Teleported to body so it overlays the
         map + sheet without z-index gymnastics. Kept inside the root
         div so the template has a single root and class attrs from
         the parent inherit cleanly. -->
    <Teleport to="body">
      <div
        v-if="gpsOutOfRange"
        class="fixed inset-0 z-[1300] flex items-end justify-center bg-bnc-ink/40 p-4 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
        @click.self="gpsOutOfRange = false"
      >
        <div class="w-full max-w-sm rounded-[var(--radius-md)] bg-bnc-paper p-4 shadow-[var(--shadow-elevated)] dark:bg-bnc-stone-900">
          <h3 class="font-display text-base font-bold tracking-tight">
            {{ t('trip.gpsOutOfRangeTitle') }}
          </h3>
          <p class="mt-2 text-sm text-bnc-stone-600 dark:text-bnc-stone-300">
            {{ t('trip.gpsOutOfRangeBody') }}
          </p>
          <button
            type="button"
            class="mt-4 inline-flex items-center justify-center rounded-full bg-bnc-primary px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-white"
            @click="gpsOutOfRange = false"
          >
            {{ t('trip.gpsOutOfRangeOk') }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
