<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
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
import NearbyHaltePanel from '@/components/NearbyHaltePanel.vue'
import CorridorPanel from '@/components/CorridorPanel.vue'
import BusListPanel from '@/components/BusListPanel.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import BusDetailCard from '@/components/BusDetailCard.vue'
import HalteDetailCard from '@/components/HalteDetailCard.vue'
import CorridorFocusPanel from '@/components/CorridorFocusPanel.vue'

const city = useCityStore()
const brt = useBrtStore()
const socket = useSocketStore()
const selection = useSelectionStore()
const focus = useFocusStore()
const { kind: selectionKind } = storeToRefs(selection)
const { isFocused } = storeToRefs(focus)

useUrlSync()

// Auto-expand the mobile bottom sheet to mid the moment a detail/route
// becomes active; null lets the user control the snap freely.
const sheetForceSnap = computed<'mid' | null>(() =>
  selectionKind.value || isFocused.value ? 'mid' : null,
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
        <NearbyHaltePanel />
        <CorridorPanel />
        <BusListPanel />
      </div>
    </aside>

    <section class="relative min-h-0">
      <MapView class="absolute inset-0" />
      <BusDataBadge />
      <MapLegend />
      <div class="pointer-events-none absolute right-3 top-3 z-[800] flex flex-col gap-2">
        <MyLocationButton class="pointer-events-auto" />
      </div>
    </section>

    <!-- Mobile bottom sheet — swaps content with the active detail
         instead of stacking another card on top. The forceSnap prop
         auto-expands to "mid" the moment a detail opens so the user
         sees the swap without dragging. -->
    <BottomSheet :force-snap="sheetForceSnap">
      <BusDetailCard v-if="selectionKind === 'bus'" />
      <HalteDetailCard v-else-if="selectionKind === 'halte'" />
      <CorridorFocusPanel v-else-if="isFocused" />
      <div v-else class="flex flex-col gap-5">
        <NearbyHaltePanel />
        <CorridorPanel />
        <BusListPanel />
      </div>
    </BottomSheet>

    <!-- Desktop info column — only on lg+. Stacks corridor focus +
         bus/halte card so a focused route and a selected bus can both
         be visible at once (bus on top, focus underneath). -->
    <div
      class="pointer-events-none fixed bottom-4 right-4 z-[1000] hidden flex-col-reverse items-stretch gap-3 lg:flex lg:max-w-md"
    >
      <CorridorFocusPanel v-if="isFocused" />
      <BusDetailCard v-if="selectionKind === 'bus'" />
      <HalteDetailCard v-if="selectionKind === 'halte'" />
    </div>
  </div>
</template>
