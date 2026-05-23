<script setup lang="ts">
/**
 * Floating control on the live map that flips between CARTO street
 * tiles and ESRI satellite imagery. Persisted in the ui store so the
 * choice survives reloads.
 */
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const { tileMode } = storeToRefs(ui)

const isSatellite = computed(() => tileMode.value === 'satellite')
</script>

<template>
  <button
    type="button"
    class="grid h-9 w-9 place-items-center rounded-full bg-white text-bnc-stone-700 shadow-[var(--shadow-elevated)] transition-colors hover:bg-bnc-stone-100 dark:bg-bnc-stone-900 dark:text-bnc-stone-200 dark:hover:bg-bnc-stone-800"
    :aria-label="isSatellite ? 'Tampilkan peta jalan' : 'Tampilkan citra satelit'"
    :title="isSatellite ? 'Tampilkan peta jalan' : 'Tampilkan citra satelit'"
    :aria-pressed="isSatellite"
    data-tour="basemap-toggle"
    @click="ui.toggleTileMode()"
  >
    <svg
      v-if="isSatellite"
      class="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden
    >
      <path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z" />
      <path d="M9 3v18M15 5v18" />
    </svg>
    <svg
      v-else
      class="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  </button>
</template>
