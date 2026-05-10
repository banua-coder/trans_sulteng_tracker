<script setup lang="ts">
/**
 * Full-screen single-corridor map. Reuses the same MapView used in
 * CityView; the difference is the focus store is hard-pinned to
 * `:kor` for the lifetime of this view, so the map only renders one
 * corridor's polyline + halte + buses (the existing MapView already
 * narrows visuals to the focused corridor).
 *
 * Mirrors the TJ "Route Map" screen (screenshot #2/#3).
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { useFocusStore } from '@/stores/focus'
import { useSocketStore } from '@/stores/socket'
import { useSelectionStore } from '@/stores/selection'
import MapView from '@/components/MapView.vue'
import BusDetailCard from '@/components/BusDetailCard.vue'
import HalteDetailCard from '@/components/HalteDetailCard.vue'

const props = defineProps<{ city: string; kor: string }>()

const { t } = useI18n()
const router = useRouter()
const brt = useBrtStore()
const city = useCityStore()
const focus = useFocusStore()
const socket = useSocketStore()
const selection = useSelectionStore()
const { corridor } = storeToRefs(focus)
const { kind: selectionKind } = storeToRefs(selection)

const liveCount = computed(() => {
  if (!corridor.value) return 0
  let n = 0
  for (const b of brt.buses.values()) if (b.kor === corridor.value.kor) n++
  return n
})

const accentColor = computed(() => corridor.value?.color || '#1D9CD4')

onMounted(async () => {
  if (!brt.corridors.length || !brt.halte.length) {
    await brt.loadRoutes(city.pref)
  }
  socket.connect(city.pref)
  focus.focus(props.kor)
})

onBeforeUnmount(() => {
  focus.clear()
  selection.clear()
})

function back() {
  router.push({ name: 'route-detail', params: { city: props.city, kor: props.kor } })
}
</script>

<template>
  <section class="relative h-full w-full overflow-hidden">
    <MapView class="absolute inset-0" />

    <!-- top bar -->
    <header class="pointer-events-none absolute inset-x-0 top-0 z-[800] flex items-start justify-between gap-2 px-3 pt-3">
      <button
        type="button"
        class="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-bnc-stone-200 bg-white/95 text-bnc-stone-700 shadow-[var(--shadow-elevated)] transition-colors hover:bg-bnc-stone-100 dark:border-bnc-stone-800 dark:bg-bnc-stone-900/95 dark:text-bnc-stone-200"
        :aria-label="t('a11y.back')"
        @click="back"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>

      <div
        v-if="corridor"
        class="pointer-events-auto flex min-w-0 max-w-[60%] flex-1 items-center gap-2 rounded-full border border-bnc-stone-200 bg-white/95 px-3 py-2 shadow-[var(--shadow-elevated)] dark:border-bnc-stone-800 dark:bg-bnc-stone-900/95"
      >
        <span
          class="grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[10px] font-extrabold text-white"
          :style="{ background: accentColor }"
          aria-hidden
        >
          {{ corridor.kor }}
        </span>
        <span class="truncate text-xs font-semibold">
          {{ corridor.origin }} – {{ corridor.toward }}
        </span>
      </div>

      <div
        class="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-bnc-stone-200 bg-white/95 px-3 py-2 shadow-[var(--shadow-elevated)] dark:border-bnc-stone-800 dark:bg-bnc-stone-900/95"
      >
        <span
          class="h-2 w-2 rounded-full"
          :style="{
            background: liveCount > 0 ? 'var(--color-bnc-accent)' : 'var(--color-stale)',
          }"
          aria-hidden
        />
        <span class="font-mono text-[10px] uppercase tracking-wider tabular-nums">
          {{ liveCount > 0 ? `${liveCount} ${t('route.busActive')}` : t('route.waitingData') }}
        </span>
      </div>
    </header>

    <!-- detail card overlay when bus or halte selected -->
    <div
      class="pointer-events-none absolute inset-x-3 bottom-3 z-[900] flex flex-col gap-2 sm:max-w-md"
    >
      <BusDetailCard v-if="selectionKind === 'bus'" />
      <HalteDetailCard v-if="selectionKind === 'halte'" />
    </div>
  </section>
</template>
