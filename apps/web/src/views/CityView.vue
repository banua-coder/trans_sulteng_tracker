<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { useFocusStore } from '@/stores/focus'
import { useSelectionStore } from '@/stores/selection'
import { useSocketStore } from '@/stores/socket'
import MapView from '@/components/MapView.vue'
import MapLegend from '@/components/MapLegend.vue'
import BusDataBadge from '@/components/BusDataBadge.vue'
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
        <CorridorPanel />
        <BusListPanel />
      </div>
    </aside>

    <section class="relative min-h-0">
      <MapView class="absolute inset-0" />
      <BusDataBadge />
      <MapLegend />
    </section>

    <!-- Mobile bottom sheet -->
    <BottomSheet>
      <div class="flex flex-col gap-5">
        <CorridorPanel />
        <BusListPanel />
      </div>
    </BottomSheet>

    <!-- One card at a time at the bottom-right "info" slot:
         · bus selected   → BusDetailCard
         · halte selected → HalteDetailCard
         · neither, but a corridor is focused → CorridorFocusPanel
         Closing the bus/halte card while focused returns to the
         focus panel automatically. -->
    <BusDetailCard v-if="selectionKind === 'bus'" />
    <HalteDetailCard v-else-if="selectionKind === 'halte'" />
    <CorridorFocusPanel v-else-if="isFocused" />
  </div>
</template>
