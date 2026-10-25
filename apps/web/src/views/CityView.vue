<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
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
import DesktopSidebar from '@/components/DesktopSidebar.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import MobileNav from '@/components/MobileNav.vue'
import BusDetailCard from '@/components/BusDetailCard.vue'
import HalteDetailCard from '@/components/HalteDetailCard.vue'
import MobileRoutesPanel from '@/components/MobileRoutesPanel.vue'
import { useTripStore } from '@/stores/trip'
import { useRideStore } from '@/stores/ride'
import { useUiStore } from '@/stores/ui'

// Lazy-loaded panels — only fetched when the user actually opens the
// trip planner / focuses a corridor / picks a plan. Keeps the trip
// planner worker bundle and the corridor-focus map logic out of the
// initial route chunk so the map paints faster on first load.
const TripDetailPanel = defineAsyncComponent(() => import('@/components/TripDetailPanel.vue'))
const MobileRouteDetailPanel = defineAsyncComponent(() => import('@/components/MobileRouteDetailPanel.vue'))
const RideHud = defineAsyncComponent(() => import('@/components/RideHud.vue'))
const RideResumeBanner = defineAsyncComponent(() => import('@/components/RideResumeBanner.vue'))

const city = useCityStore()
const brt = useBrtStore()
const socket = useSocketStore()
const selection = useSelectionStore()
const focus = useFocusStore()
const trip = useTripStore()
const ride = useRideStore()
const ui = useUiStore()
const { kind: selectionKind } = storeToRefs(selection)
const { isFocused } = storeToRefs(focus)
const { selectedPlan: tripSelectedPlan } = storeToRefs(trip)
const { isActive: rideActive } = storeToRefs(ride)

useUrlSync()

const { t } = useI18n()
function openPlanner() {
  selection.clear()
  focus.clear()
  trip.selectPlan(null)
  ui.mobileTab = 'plan'
  ui.openSheet()
}

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
    // Halte-list corridor filter is per-city — a kor like 'K1' from
    // Palu won't exist in Donggala and would silently empty the list.
    ui.setHalteListFilter(null)
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
    <DesktopSidebar />

    <!-- BottomSheet writes its current snap height to `--sheet-h` on
         :root; we wrap MapView in a sized box that uses that value
         as its `bottom` inset so the map's frame shrinks and grows
         with the sheet drag. Desktop overrides --sheet-h to 0px so
         the map fills the whole section. The inner wrapper is what
         the map's h-full computes against, so size changes propagate
         and the ResizeObserver in MapView fires invalidateSize. -->
    <section class="relative min-h-0 lg:[--sheet-h:0px]">
      <div class="absolute inset-0">
        <MapView class="h-full w-full" />
      </div>
      <!-- Phone: a floating "where to?" pill, the planner's front door. -->
      <button
        type="button"
        class="pointer-events-auto absolute left-3 right-16 top-3 z-[800] flex min-h-11 items-center gap-3 rounded-full border border-bnc-stone-200 bg-white/95 px-4 text-left text-sm text-bnc-stone-500 shadow-[var(--shadow-elevated)] backdrop-blur dark:border-bnc-stone-800 dark:bg-bnc-stone-900/95 lg:hidden"
        @click="openPlanner"
      >
        <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        {{ t('sidebar.whereTo') }}
      </button>
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
    <BottomSheet :force-snap="sheetForceSnap" :ping="ui.sheetPing">
      <RideHud v-if="rideActive" />
      <BusDetailCard v-else-if="selectionKind === 'bus'" />
      <HalteDetailCard v-else-if="selectionKind === 'halte'" />
      <MobileRouteDetailPanel v-else-if="isFocused" />
      <TripDetailPanel v-else-if="tripSelectedPlan" />
      <MobileRoutesPanel v-else />
    </BottomSheet>



    <MobileNav />

    <RideResumeBanner />
  </div>
</template>
