<script setup lang="ts">
/**
 * Printable per-corridor map booklet. Renders one A4-landscape sheet
 * per corridor — much more readable than cramming the whole network
 * into a single page. Each sheet is a <CorridorMapSheet>, mounting
 * its own Leaflet instance fitted to that corridor's bounds. The
 * browser print dialog ("Save as PDF") emits one PDF page per sheet
 * thanks to page-break-after: always in the child's print CSS.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'

import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { formatIndonesianDate } from '@/lib/exportMap'
import CorridorMapSheet from '@/components/CorridorMapSheet.vue'
import type { CitySlug } from '@/types/brt'

const props = defineProps<{ city: CitySlug }>()

const router = useRouter()
const cityStore = useCityStore()
const brt = useBrtStore()
const { corridors } = storeToRefs(brt)

const cityName = computed(() => (props.city === 'palu' ? 'TransPalu' : 'TransDonggala'))
const cityIconUrl = computed(() => brt.cityByPref.get(cityStore.pref)?.icon ?? null)
const todayLabel = computed(() => formatIndonesianDate(new Date()))

const qrUrl = computed(() => `${window.location.origin}/${props.city}`)

const tileMode = ref<'map' | 'satellite'>('map')

// JS-driven mobile detection so the print handler can temporarily
// force the desktop layout. CSS media queries can't be toggled at
// runtime, but a reactive flag bound to a class can. While `printing`
// is true (during the brief window between user tapping "Cetak" and
// the browser print dialog opening), the layout reverts to desktop
// regardless of viewport so the print preview renders the proper
// A4 landscape sheet.
const viewportIsMobile = ref(false)
const printing = ref(false)
const useMobileLayout = computed(() => viewportIsMobile.value && !printing.value)

function updateViewport() {
  viewportIsMobile.value = window.innerWidth < 768
}

function onAfterPrint() {
  printing.value = false
}

onMounted(() => {
  updateViewport()
  window.addEventListener('resize', updateViewport)
  window.addEventListener('afterprint', onAfterPrint)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
  window.removeEventListener('afterprint', onAfterPrint)
})

const orderedCorridors = computed(() =>
  [...corridors.value].sort((a, b) => a.kor.localeCompare(b.kor, undefined, { numeric: true })),
)

watch(
  () => props.city,
  async (slug) => {
    if (cityStore.slug !== slug) cityStore.setCity(slug)
    if (!corridors.value.length) await brt.loadRoutes(cityStore.pref)
  },
  { immediate: true },
)

function back() {
  router.push({ name: 'city', params: { city: props.city } })
}

async function printPage() {
  // Flip to desktop layout so the print preview sees the A4 sheet
  // sizing instead of the phone-stacked layout. Wait long enough for
  // Vue to re-render AND for each Leaflet map to re-measure + reload
  // tiles at the new container dimensions.
  printing.value = true
  await nextTick()
  // Bump every Leaflet map so it re-projects at the new size.
  for (const el of document.querySelectorAll<HTMLElement>('.leaflet-container')) {
    el.dispatchEvent(new Event('cektrans:resize'))
  }
  // Let tiles fetch + paint before invoking print.
  await new Promise((r) => setTimeout(r, 700))
  window.print()
}
</script>

<template>
  <div class="export-page" :class="{ 'is-mobile': useMobileLayout }">
    <div class="no-print sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b border-bnc-stone-200 bg-white px-3 py-2 dark:border-bnc-stone-800 dark:bg-bnc-stone-900 sm:px-4">
      <button
        type="button"
        class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
        aria-label="Kembali"
        @click="back"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <p class="min-w-0 flex-1 truncate font-display text-sm font-semibold">
        Peta Koridor {{ cityName }}
        <span v-if="orderedCorridors.length" class="ml-1 font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
          · {{ orderedCorridors.length }} koridor
        </span>
      </p>
      <div class="ml-auto flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
        <div class="inline-flex shrink-0 overflow-hidden rounded-md border border-bnc-stone-300 dark:border-bnc-stone-700">
          <button
            type="button"
            class="px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
            :class="
              tileMode === 'map'
                ? 'bg-bnc-ink text-bnc-paper dark:bg-bnc-paper dark:text-bnc-ink'
                : 'bg-white text-bnc-stone-600 hover:bg-bnc-stone-100 dark:bg-bnc-stone-900 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800'
            "
            @click="tileMode = 'map'"
          >Peta</button>
          <button
            type="button"
            class="px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
            :class="
              tileMode === 'satellite'
                ? 'bg-bnc-ink text-bnc-paper dark:bg-bnc-paper dark:text-bnc-ink'
                : 'bg-white text-bnc-stone-600 hover:bg-bnc-stone-100 dark:bg-bnc-stone-900 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800'
            "
            @click="tileMode = 'satellite'"
          >Satelit</button>
        </div>
      <button
        type="button"
        class="inline-flex shrink-0 items-center gap-2 rounded-md bg-bnc-ink px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-bnc-paper transition-colors hover:bg-bnc-stone-800 dark:bg-bnc-paper dark:text-bnc-ink dark:hover:bg-bnc-stone-200"
        :aria-label="'Cetak / Simpan PDF'"
        :title="'Cetak / Simpan PDF'"
        @click="printPage"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
          <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
        </svg>
        <span class="hidden sm:inline">Cetak / Simpan PDF</span>
        <span class="sm:hidden">PDF</span>
      </button>
      </div>
    </div>

    <CorridorMapSheet
      v-for="c in orderedCorridors"
      :key="c.kor"
      :corridor="c"
      :city-name="cityName"
      :city-icon-url="cityIconUrl"
      :qr-url="qrUrl"
      :today-label="todayLabel"
      :tile-mode="tileMode"
      :mobile-layout="useMobileLayout"
    />
  </div>
</template>

<style scoped>
.export-page {
  background: #f5f5f5;
  min-height: 100vh;
  padding-bottom: 24px;
}

@media print {
  @page {
    size: A4 landscape;
    margin: 8mm;
  }
  .no-print { display: none !important; }
  .export-page {
    background: white;
    min-height: 0;
    padding: 0;
  }
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>
