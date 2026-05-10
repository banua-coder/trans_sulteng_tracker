<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { useSelectionStore } from '@/stores/selection'
import { useSocketStore } from '@/stores/socket'
import MapView from '@/components/MapView.vue'
import CorridorPanel from '@/components/CorridorPanel.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import BusDetailCard from '@/components/BusDetailCard.vue'
import HalteDetailCard from '@/components/HalteDetailCard.vue'

const city = useCityStore()
const brt = useBrtStore()
const socket = useSocketStore()
const selection = useSelectionStore()

watch(
  () => city.pref,
  async (pref) => {
    selection.clear()
    brt.clearBuses()
    await brt.loadRoutes(pref)
    socket.connect(pref)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  socket.disconnect()
  selection.clear()
})
</script>

<template>
  <div class="grid h-[calc(100dvh-var(--header-h)-32px)] grid-cols-1 lg:grid-cols-[var(--sidebar-w)_1fr]">
    <!-- Desktop sidebar -->
    <aside
      class="hidden border-r border-bnc-stone-200 bg-bnc-stone-50/60 p-4 lg:block lg:overflow-y-auto dark:border-bnc-stone-800 dark:bg-bnc-stone-900/40"
    >
      <CorridorPanel />
    </aside>

    <section class="relative min-h-0">
      <MapView class="absolute inset-0" />
    </section>

    <!-- Mobile bottom sheet -->
    <BottomSheet>
      <CorridorPanel />
    </BottomSheet>

    <!-- Detail cards (one shows at a time per selection store) -->
    <BusDetailCard />
    <HalteDetailCard />
  </div>
</template>
