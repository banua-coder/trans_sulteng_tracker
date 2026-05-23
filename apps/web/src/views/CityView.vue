<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { useFocusStore } from '@/stores/focus'
import { useSelectionStore } from '@/stores/selection'
import { useSocketStore } from '@/stores/socket'
import { useUrlSync } from '@/lib/urlSync'
import MapView from '@/components/MapView.vue'
import MapLegend from '@/components/MapLegend.vue'
import BusDataBadge from '@/components/BusDataBadge.vue'
import MyLocationButton from '@/components/MyLocationButton.vue'
import BasemapToggle from '@/components/BasemapToggle.vue'
import NearbyHaltePanel from '@/components/NearbyHaltePanel.vue'
import CorridorPanel from '@/components/CorridorPanel.vue'
import BusListPanel from '@/components/BusListPanel.vue'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import BusDetailCard from '@/components/BusDetailCard.vue'
import HalteDetailCard from '@/components/HalteDetailCard.vue'
import MobileRoutesPanel from '@/components/MobileRoutesPanel.vue'
import { useTripStore } from '@/stores/trip'
import { useRideStore } from '@/stores/ride'

// Lazy-loaded panels — only fetched when the user actually opens the
// trip planner / focuses a corridor / picks a plan. Keeps the trip
// planner worker bundle and the corridor-focus map logic out of the
// initial route chunk so the map paints faster on first load.
const TripPlannerPanel = defineAsyncComponent(() => import('@/components/TripPlannerPanel.vue'))
const TripDetailPanel = defineAsyncComponent(() => import('@/components/TripDetailPanel.vue'))
const CorridorFocusPanel = defineAsyncComponent(() => import('@/components/CorridorFocusPanel.vue'))
const MobileRouteDetailPanel = defineAsyncComponent(() => import('@/components/MobileRouteDetailPanel.vue'))
const RideHud = defineAsyncComponent(() => import('@/components/RideHud.vue'))

const city = useCityStore()
const brt = useBrtStore()
const socket = useSocketStore()
const selection = useSelectionStore()
const focus = useFocusStore()
const trip = useTripStore()
const ride = useRideStore()
const { kind: selectionKind } = storeToRefs(selection)
const { isFocused } = storeToRefs(focus)
const { selectedPlan: tripSelectedPlan } = storeToRefs(trip)
const { isActive: rideActive } = storeToRefs(ride)

useUrlSync()

// Auto-expand the mobile bottom sheet to mid the moment a detail/route
// becomes active; null lets the user control the snap freely.
const sheetForceSnap = computed<'mid' | null>(() =>
  selectionKind.value || isFocused.value || tripSelectedPlan.value || rideActive.value ? 'mid' : null,
)

watch(
  () => city.pref,
  async (pref) => {
    selection.clear()
    focus.clear()
    brt.clearBuses()
    await brt.loadRoutes(pref)
    socket.connect(pref)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  socket.disconnect()
  selection.clear()
  focus.clear()
})
</script>

<template>
  <div class="grid h-[calc(100dvh-var(--header-h)-32px)] grid-cols-1 lg:grid-cols-[var(--sidebar-w)_1fr]">
    <!-- Desktop sidebar -->
    <aside
      class="hidden border-r border-bnc-stone-200 bg-bnc-stone-50/60 p-4 lg:block lg:overflow-y-auto dark:border-bnc-stone-800 dark:bg-bnc-stone-900/40"
    >
      <div class="flex flex-col gap-5">
        <CollapsibleSection name="trip" :title="'Rencana Perjalanan'">
          <TripPlannerPanel />
        </CollapsibleSection>
        <NearbyHaltePanel />
        <CorridorPanel />
        <BusListPanel />
        <router-link
          :to="{ name: 'map-export', params: { city: city.slug } }"
          class="inline-flex items-center gap-2 self-start rounded-md border border-bnc-stone-200 bg-white px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-bnc-ink transition-colors hover:bg-bnc-stone-100 dark:border-bnc-stone-700 dark:bg-bnc-stone-900 dark:text-bnc-paper dark:hover:bg-bnc-stone-800"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Unduh Peta Koridor
        </router-link>
      </div>
    </aside>

    <!-- BottomSheet writes its current snap height to `--sheet-h` on
         :root; we wrap MapView in a sized box that uses that value
         as its `bottom` inset so the map's frame shrinks and grows
         with the sheet drag. Desktop overrides --sheet-h to 0px so
         the map fills the whole section. The inner wrapper is what
         the map's h-full computes against, so size changes propagate
         and the ResizeObserver in MapView fires invalidateSize. -->
    <section class="relative min-h-0 lg:[--sheet-h:0px]">
      <div
        class="absolute inset-x-0 top-0"
        :style="{ bottom: 'var(--sheet-h, 88px)', transition: 'bottom 280ms ease' }"
      >
        <MapView class="h-full w-full" />
      </div>
      <BusDataBadge />
      <MapLegend />
      <div class="pointer-events-none absolute right-3 top-3 z-[800] flex flex-col gap-2">
        <MyLocationButton class="pointer-events-auto" />
        <BasemapToggle class="pointer-events-auto" />
      </div>
    </section>

    <!-- Mobile bottom sheet — TJ-style. Content swaps based on
         selection state:
           bus selected  → BusDetailCard
           halte selected → HalteDetailCard
           corridor focused → MobileRouteDetailPanel (halte timeline)
           nothing        → MobileRoutesPanel (RUTE / HALTE tabs)
         Desktop keeps the sidebar's old layout untouched. -->
    <BottomSheet :force-snap="sheetForceSnap">
      <RideHud v-if="rideActive" />
      <BusDetailCard v-else-if="selectionKind === 'bus'" />
      <HalteDetailCard v-else-if="selectionKind === 'halte'" />
      <MobileRouteDetailPanel v-else-if="isFocused" />
      <TripDetailPanel v-else-if="tripSelectedPlan" />
      <MobileRoutesPanel v-else />
    </BottomSheet>

    <!-- Desktop info panel — only on lg+. Selection (bus/halte) wins
         over corridor focus so the drill-down flow stays intact:
         focus corridor -> tap bus -> bus detail covers the corridor
         panel -> close bus -> corridor panel returns. Same cascade
         order as the mobile bottom sheet. -->
    <div
      class="pointer-events-none fixed bottom-4 right-4 z-[1000] hidden lg:block lg:max-w-md"
    >
      <RideHud v-if="rideActive" />
      <BusDetailCard v-else-if="selectionKind === 'bus'" />
      <HalteDetailCard v-else-if="selectionKind === 'halte'" />
      <CorridorFocusPanel v-else-if="isFocused" />
      <TripDetailPanel v-else-if="tripSelectedPlan" />
    </div>
  </div>
</template>
