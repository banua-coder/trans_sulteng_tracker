<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeoStore } from '@/stores/geo'
import { trackEvent } from '@/lib/analytics'

const { t } = useI18n()
const geo = useGeoStore()

const label = computed(() => t('a11y.myLocation'))
const tooltip = computed(() => {
  switch (geo.status) {
    case 'denied':
      return t('nearby.denied')
    case 'pending':
      return t('nearby.pending')
    default:
      return label.value
  }
})

async function trigger() {
  await geo.request()
  if (geo.status === 'granted') trackEvent('geo_grant')
  else if (geo.status === 'denied') trackEvent('geo_denied')
}
</script>

<template>
  <button
    type="button"
    class="grid h-9 w-9 place-items-center rounded-full border border-bnc-stone-200 bg-white/95 text-bnc-stone-700 shadow-[var(--shadow-elevated)] transition-all hover:bg-bnc-stone-100 dark:border-bnc-stone-800 dark:bg-bnc-stone-900/95 dark:text-bnc-stone-200 dark:hover:bg-bnc-stone-800"
    :class="{
      'animate-pulse-soft': geo.status === 'pending',
      'text-bnc-accent': geo.status === 'granted',
    }"
    :aria-label="label"
    :title="tooltip"
    :aria-busy="geo.status === 'pending'"
    data-tour="my-location"
    @click="trigger"
  >
    <svg
      class="h-4 w-4 transition-transform"
      :class="{ 'scale-110': geo.status === 'granted' }"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </svg>
  </button>
</template>

<style scoped>
@keyframes pulse-soft {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
.animate-pulse-soft {
  animation: pulse-soft 1.2s ease-in-out infinite;
}
</style>
