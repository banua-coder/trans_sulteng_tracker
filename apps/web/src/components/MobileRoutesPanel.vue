<script setup lang="ts">
/**
 * TJ-style "Rute & Halte" picker — rendered INSIDE the existing
 * mobile BottomSheet when no corridor/bus/halte is selected. Replaces
 * the old NearbyHaltePanel + CorridorPanel + BusListPanel stack on
 * mobile. Desktop keeps the sidebar panels unchanged.
 *
 * Tapping a corridor focuses it (existing focus store), which causes
 * CityView's bottom sheet to swap content to MobileRouteDetailPanel.
 * Tapping a halte selects it, which swaps to HalteDetailCard.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { useFocusStore } from '@/stores/focus'
import { useSelectionStore } from '@/stores/selection'
import { useUiStore } from '@/stores/ui'
import RouteListItem from '@/components/RouteListItem.vue'
import TripPlannerPanel from '@/components/TripPlannerPanel.vue'

const { t } = useI18n()
const brt = useBrtStore()
const city = useCityStore()
const focus = useFocusStore()
const selection = useSelectionStore()
const ui = useUiStore()
const { corridors, halte } = storeToRefs(brt)
const { busSearch, mobileTab: tab, mobileScrollY } = storeToRefs(ui)

const scrollEl = ref<HTMLElement | null>(null)

onMounted(() => {
  if (mobileScrollY.value > 0) {
    nextTick(() => {
      scrollEl.value?.closest('[data-sheet-scroll]')?.scrollTo(0, mobileScrollY.value)
    })
  }
})

onBeforeUnmount(() => {
  const el = scrollEl.value?.closest('[data-sheet-scroll]')
  mobileScrollY.value = el ? (el as HTMLElement).scrollTop : 0
})

const halteCountByKor = computed(() => {
  // Count forward-direction halte only. The bulk feed has a separate
  // row per direction per stop (a stop appears once as forward, once
  // as reverse — with different sh_ids AND slightly different coords
  // for opposite-side poles). Counting both ends up at 48 for K1 and
  // sh_name dedupe still gives 41 (some terminals are missing in the
  // reverse leg). Forward-only matches the per-leg detail screen.
  const counts = new Map<string, number>()
  const fwdKey = new Map(corridors.value.map((c) => [c.kor, `${c.origin}|${c.toward}`]))
  for (const h of halte.value) {
    if (`${h.origin}|${h.toward}` !== fwdKey.get(h.kor)) continue
    counts.set(h.kor, (counts.get(h.kor) ?? 0) + 1)
  }
  return counts
})

const busCountByKor = computed(() => {
  // Watch buses Map via a snapshot. The Pinia reactive Map should
  // re-evaluate this on every upsert.
  const counts = new Map<string, number>()
  for (const b of brt.buses.values()) {
    counts.set(b.kor, (counts.get(b.kor) ?? 0) + 1)
  }
  return counts
})

const filteredRoutes = computed(() => {
  const q = busSearch.value.trim().toLowerCase()
  const list = corridors.value.filter((c) => c.pref === city.pref)
  if (!q) return list
  return list.filter((c) =>
    [c.kor, c.origin, c.toward].filter(Boolean).join(' ').toLowerCase().includes(q),
  )
})

const filteredHalte = computed(() => {
  const q = busSearch.value.trim().toLowerCase()
  // Dedupe by sh_id — same physical stop appears once per direction.
  const seen = new Map<string, (typeof halte.value)[number]>()
  for (const h of halte.value) {
    if (!seen.has(h.sh_id)) seen.set(h.sh_id, h)
  }
  const list = [...seen.values()]
  if (!q) return list
  return list.filter((h) =>
    [h.sh_name, h.kor, h.sh_id].filter(Boolean).join(' ').toLowerCase().includes(q),
  )
})

function pickRoute(kor: string) {
  focus.focus(kor)
}

function pickHalte(shId: string) {
  selection.selectHalte(shId)
}
</script>

<template>
  <div ref="scrollEl" class="flex flex-col gap-3">
    <!-- tabs -->
    <div class="flex shrink-0 gap-2">
      <button
        type="button"
        class="flex-1 rounded-full px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors"
        :class="
          tab === 'routes'
            ? 'bg-bnc-primary text-white shadow-sm'
            : 'bg-bnc-stone-100 text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300'
        "
        @click="tab = 'routes'"
      >
        {{ t('route.tabRoute') }}
      </button>
      <button
        type="button"
        class="flex-1 rounded-full px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors"
        :class="
          tab === 'halte'
            ? 'bg-bnc-primary text-white shadow-sm'
            : 'bg-bnc-stone-100 text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300'
        "
        @click="tab = 'halte'"
      >
        {{ t('route.tabHalte') }}
      </button>
      <button
        type="button"
        class="flex-1 rounded-full px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors"
        :class="
          tab === 'plan'
            ? 'bg-bnc-primary text-white shadow-sm'
            : 'bg-bnc-stone-100 text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300'
        "
        @click="tab = 'plan'"
      >
        {{ t('route.tabPlan') }}
      </button>
    </div>

    <!-- trip planner tab -->
    <TripPlannerPanel v-if="tab === 'plan'" />

    <!-- search (shared with BusListPanel via ui store so search persists across swaps) -->
    <label v-if="tab !== 'plan'" class="relative block shrink-0">
      <span class="sr-only">{{ t('route.search') }}</span>
      <input
        v-model="busSearch"
        type="search"
        autocomplete="off"
        :placeholder="tab === 'routes' ? t('route.searchRoute') : t('route.searchHalte')"
        class="w-full rounded-[var(--radius-md)] border border-bnc-stone-200 bg-bnc-stone-50 px-3 py-2 pr-9 text-sm placeholder:text-bnc-stone-400 focus:border-bnc-accent focus:outline-none dark:border-bnc-stone-800 dark:bg-bnc-stone-800"
      />
      <svg
        class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bnc-stone-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    </label>

    <!-- list -->
    <ul v-if="tab === 'routes'" class="flex flex-col gap-2">
      <li v-for="c in filteredRoutes" :key="c.kor">
        <button type="button" class="w-full" @click="pickRoute(c.kor)">
          <RouteListItem
            :kor="c.kor"
            :color="c.color || '#1D9CD4'"
            :origin="c.origin"
            :toward="c.toward"
            :halte-count="halteCountByKor.get(c.kor)"
            :bus-count="busCountByKor.get(c.kor) ?? 0"
          />
        </button>
      </li>
      <li
        v-if="!filteredRoutes.length"
        class="rounded-md bg-bnc-stone-100 px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500 dark:bg-bnc-stone-800"
      >
        {{ t('route.empty') }}
      </li>
    </ul>

    <ul v-else-if="tab === 'halte'" class="flex flex-col gap-2">
      <li v-for="h in filteredHalte" :key="h.sh_id">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-bnc-stone-200 bg-white px-3 py-3 text-left transition-colors hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-900 dark:hover:border-bnc-stone-700"
          @click="pickHalte(h.sh_id)"
        >
          <span
            class="h-3 w-3 shrink-0 rounded-full border-2 border-white"
            :style="{ background: brt.colorForKor(h.kor), boxShadow: '0 0 0 1px ' + brt.colorForKor(h.kor) }"
            aria-hidden
          />
          <div class="min-w-0 flex-1">
            <p class="truncate font-display text-sm font-semibold tracking-tight">
              {{ h.sh_name }}
            </p>
            <p class="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
              {{ h.kor }} · {{ h.origin }} → {{ h.toward }}
            </p>
          </div>
          <svg
            class="h-4 w-4 shrink-0 text-bnc-stone-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </li>
      <li
        v-if="!filteredHalte.length"
        class="rounded-md bg-bnc-stone-100 px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500 dark:bg-bnc-stone-800"
      >
        {{ t('route.empty') }}
      </li>
    </ul>
  </div>
</template>
