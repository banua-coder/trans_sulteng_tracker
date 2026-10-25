<script setup lang="ts">
/**
 * Desktop sidebar. One feature per tab so nothing stacks into a long
 * scroll, and detail (bus, stop, route, plan) replaces the tab body
 * here instead of floating over the map. The ride companion pins
 * above the tabs because it must stay visible while you browse.
 * Phones keep the bottom sheet (no room for a sidebar).
 */
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { useFocusStore } from '@/stores/focus'
import { useRideStore } from '@/stores/ride'
import { useSelectionStore } from '@/stores/selection'
import { useTripStore } from '@/stores/trip'
import CorridorPanel from '@/components/CorridorPanel.vue'
import BusListPanel from '@/components/BusListPanel.vue'
import NearbyHaltePanel from '@/components/NearbyHaltePanel.vue'
import HalteListPanel from '@/components/HalteListPanel.vue'
import BusDetailCard from '@/components/BusDetailCard.vue'
import HalteDetailCard from '@/components/HalteDetailCard.vue'
import SidebarIcon from '@/components/SidebarIcon.vue'

const TripPlannerPanel = defineAsyncComponent(() => import('@/components/TripPlannerPanel.vue'))
const TripDetailPanel = defineAsyncComponent(() => import('@/components/TripDetailPanel.vue'))
const CorridorFocusPanel = defineAsyncComponent(() => import('@/components/CorridorFocusPanel.vue'))
const RideHud = defineAsyncComponent(() => import('@/components/RideHud.vue'))

type Tab = 'routes' | 'buses' | 'stops' | 'plan'

const { t } = useI18n()
const brt = useBrtStore()
const city = useCityStore()
const { corridors } = storeToRefs(brt)
const selection = useSelectionStore()
const focus = useFocusStore()
const trip = useTripStore()
const { kind: selectionKind } = storeToRefs(selection)
const { isFocused } = storeToRefs(focus)
const { selectedPlan } = storeToRefs(trip)
const { isActive: rideActive } = storeToRefs(useRideStore())

const tab = ref<Tab>('routes')

const tabs = computed<{ id: Tab; label: string; count?: number }[]>(() => [
  { id: 'routes', label: t('sidebar.routes'), count: corridors.value.length },
  { id: 'buses', label: t('sidebar.buses'), count: brt.activeBusCount() },
  { id: 'stops', label: t('sidebar.stops') },
  { id: 'plan', label: t('sidebar.plan') },
])

// Same cascade as the old floating card: a drill-down (bus on a
// focused route) shows the deepest thing selected.
const detail = computed<'bus' | 'halte' | 'route' | 'trip' | null>(() => {
  if (selectionKind.value === 'bus') return 'bus'
  if (selectionKind.value === 'halte') return 'halte'
  if (isFocused.value) return 'route'
  if (selectedPlan.value) return 'trip'
  return null
})

// Opening a detail moves to the tab it belongs to, so closing it
// lands the user back in the right list.
watch(detail, (d) => {
  if (d === 'bus') tab.value = 'buses'
  else if (d === 'halte') tab.value = 'stops'
  else if (d === 'route') tab.value = 'routes'
  else if (d === 'trip') tab.value = 'plan'
})

// Planning from a stop card fills the planner; show it.
watch(() => [trip.origin, trip.destination], () => {
  if (!detail.value && (trip.origin || trip.destination)) tab.value = 'plan'
})

/** Picking a tab while a detail is open leaves that detail. */
function pick(id: Tab) {
  if (detail.value) {
    selection.clear()
    focus.clear()
    trip.selectPlan(null)
  }
  tab.value = id
}

function onKey(e: KeyboardEvent, i: number) {
  const n = tabs.value.length
  const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : -1
  if (next < 0) return
  e.preventDefault()
  pick(tabs.value[next].id)
  ;(document.getElementById(`sidebar-tab-${tab.value}`) as HTMLElement | null)?.focus()
}
</script>

<template>
  <aside
    class="hidden min-h-0 flex-col border-r border-bnc-stone-200 bg-bnc-stone-50/60 lg:flex dark:border-bnc-stone-800 dark:bg-bnc-stone-900/40"
  >
    <div v-if="rideActive" class="sidebar-detail border-b border-bnc-stone-200 p-4 dark:border-bnc-stone-800">
      <RideHud />
    </div>

    <div
      role="tablist"
      :aria-label="t('sidebar.nav')"
      class="grid shrink-0 grid-cols-4 border-b border-bnc-stone-200 dark:border-bnc-stone-800"
    >
      <button
        v-for="(tb, i) in tabs"
        :id="`sidebar-tab-${tb.id}`"
        :key="tb.id"
        type="button"
        role="tab"
        :aria-selected="tab === tb.id"
        :aria-controls="`sidebar-panel-${tb.id}`"
        :tabindex="tab === tb.id ? 0 : -1"
        class="relative flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bnc-accent"
        :class="
          tab === tb.id
            ? 'text-bnc-ink dark:text-bnc-paper'
            : 'text-bnc-stone-500 hover:bg-bnc-stone-100 hover:text-bnc-ink dark:hover:bg-bnc-stone-800/60 dark:hover:text-bnc-paper'
        "
        @click="pick(tb.id)"
        @keydown="onKey($event, i)"
      >
        <SidebarIcon :name="tb.id" />
        <span class="flex items-center gap-1">
          {{ tb.label }}
          <span v-if="tb.count != null" class="font-mono text-[11px] tabular-nums text-bnc-stone-500">{{ tb.count }}</span>
        </span>
        <span v-if="tab === tb.id" class="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-bnc-accent" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      <!-- Detail replaces the tab body; closing it returns to the tab. -->
      <div v-if="detail" class="sidebar-detail">
        <BusDetailCard v-if="detail === 'bus'" />
        <HalteDetailCard v-else-if="detail === 'halte'" />
        <CorridorFocusPanel v-else-if="detail === 'route'" />
        <TripDetailPanel v-else />
      </div>
      <div v-else :id="`sidebar-panel-${tab}`" role="tabpanel" :aria-labelledby="`sidebar-tab-${tab}`" class="flex flex-col gap-4">
        <template v-if="tab === 'routes'">
          <CorridorPanel />
          <router-link
            :to="{ name: 'map-export', params: { city: city.slug } }"
            class="inline-flex min-h-11 items-center gap-2 self-start rounded-md border border-bnc-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-bnc-ink transition-colors hover:bg-bnc-stone-100 dark:border-bnc-stone-700 dark:bg-bnc-stone-900 dark:text-bnc-paper dark:hover:bg-bnc-stone-800"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Unduh Peta Koridor
          </router-link>
        </template>
        <BusListPanel v-else-if="tab === 'buses'" />
        <template v-else-if="tab === 'stops'">
          <NearbyHaltePanel />
          <HalteListPanel />
        </template>
        <TripPlannerPanel v-else />
      </div>
    </div>
  </aside>
</template>
