<script setup lang="ts">
/**
 * Map-overlay badge that shows a pulsing "Loading bus data…" chip in
 * the top-left of the map while buses haven't arrived yet. It never
 * shows a "no data" state — that's the OperatingBanner's job. Once
 * any bus is in the store, the badge hides.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'

const { t } = useI18n()
const brt = useBrtStore()
const { buses } = storeToRefs(brt)

const visible = computed(() => buses.value.size === 0)
</script>

<template>
  <transition name="badge-fade">
    <div
      v-if="visible"
      class="pointer-events-auto absolute left-3 top-3 z-[800] flex items-center gap-2 rounded-full border border-bnc-stone-200 bg-white/95 px-3 py-1.5 text-xs shadow-[var(--shadow-elevated)] backdrop-blur dark:border-bnc-stone-800 dark:bg-bnc-stone-900/95"
      role="status"
      aria-live="polite"
    >
      <span class="live-dot" aria-hidden />
      <span class="font-mono text-[11px] uppercase tracking-wider text-bnc-stone-700 dark:text-bnc-stone-200">
        {{ t('operating.loading') }}
      </span>
    </div>
  </transition>
</template>

<style scoped>
.badge-fade-enter-active,
.badge-fade-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.badge-fade-enter-from,
.badge-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
