<script setup lang="ts">
/**
 * Printable per-corridor map booklet. Renders one A4-landscape sheet
 * per corridor — much more readable than cramming the whole network
 * into a single page. Each sheet is a <CorridorMapSheet>, mounting
 * its own Leaflet instance fitted to that corridor's bounds. The
 * browser print dialog ("Save as PDF") emits one PDF page per sheet
 * thanks to page-break-after: always in the child's print CSS.
 */
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'

import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import CorridorMapSheet from '@/components/CorridorMapSheet.vue'
import type { CitySlug } from '@/types/brt'

const props = defineProps<{ city: CitySlug }>()

const router = useRouter()
const cityStore = useCityStore()
const brt = useBrtStore()
const { corridors, halte } = storeToRefs(brt)

const cityName = computed(() => (props.city === 'palu' ? 'TransPalu' : 'TransDonggala'))
const cityIconUrl = computed(() => brt.cityByPref.get(cityStore.pref)?.icon ?? null)
const todayLabel = computed(() => {
  const d = new Date()
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
})

const qrUrl = computed(() => `${window.location.origin}/${props.city}`)

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

function printPage() {
  window.print()
}
</script>

<template>
  <div class="export-page">
    <div class="no-print sticky top-0 z-50 flex items-center gap-2 border-b border-bnc-stone-200 bg-white px-4 py-2 dark:border-bnc-stone-800 dark:bg-bnc-stone-900">
      <button
        type="button"
        class="grid h-8 w-8 place-items-center rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
        aria-label="Kembali"
        @click="back"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <p class="font-display text-sm font-semibold">
        Peta Koridor {{ cityName }}
        <span v-if="orderedCorridors.length" class="ml-1 font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
          · {{ orderedCorridors.length }} koridor
        </span>
      </p>
      <button
        type="button"
        class="ml-auto inline-flex items-center gap-2 rounded-md bg-bnc-ink px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-bnc-paper transition-colors hover:bg-bnc-stone-800 dark:bg-bnc-paper dark:text-bnc-ink dark:hover:bg-bnc-stone-200"
        @click="printPage"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
          <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
        </svg>
        Cetak Semua / Simpan PDF
      </button>
    </div>

    <CorridorMapSheet
      v-for="c in orderedCorridors"
      :key="c.kor"
      :corridor="c"
      :halte="halte"
      :city-name="cityName"
      :city-icon-url="cityIconUrl"
      :qr-url="qrUrl"
      :today-label="todayLabel"
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
