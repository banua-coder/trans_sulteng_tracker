<script setup lang="ts">
/**
 * Map-overlay badge in the top-left of the map. Shows the current
 * "where are the buses?" status while the bus map is empty. Hides
 * the moment any bus arrives in the store.
 *
 * Earlier this badge only said "Memuat data bus…" and never timed
 * out, so an empty Donggala stream (legitimate during quiet hours
 * or outside the 06–18 WITA window) looked like a broken loader.
 * Now it mirrors CorridorPanel's busStatusKey state machine:
 *
 *   socket idle / connecting        → "Memuat data bus…"
 *   socket live + operating hours   → "Menunggu data bus…"
 *   socket live + outside hours     → "Bus belum beroperasi"
 *   socket offline                  → "Koneksi terputus"
 *
 * The OperatingBanner still handles the long-form operating-window
 * messaging; this badge is the at-a-glance map version.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useSocketStore } from '@/stores/socket'
import { operatingState } from '@/lib/operating'

const { t } = useI18n()
const brt = useBrtStore()
const socket = useSocketStore()
const { buses } = storeToRefs(brt)

type Status = null | 'loading' | 'waiting' | 'sleeping' | 'offline'

const status = computed<Status>(() => {
  if (buses.value.size > 0) return null
  switch (socket.state) {
    case 'idle':
    case 'connecting':
      return 'loading'
    case 'offline':
      return 'offline'
    case 'live':
      return operatingState().active ? 'waiting' : 'sleeping'
  }
  return null
})

const label = computed(() => {
  switch (status.value) {
    case 'loading':
      return t('operating.loading')
    case 'waiting':
      return t('operating.waiting')
    case 'sleeping':
      return t('operating.sleeping')
    case 'offline':
      return t('status.offline')
    default:
      return ''
  }
})

// The dot only pulses when we're actively trying to fetch data.
// 'waiting' and 'sleeping' are stable states (connected, nothing to
// show right now) — the pulse there would falsely imply progress.
const isLoading = computed(() => status.value === 'loading')
</script>

<template>
  <transition name="badge-fade">
    <div
      v-if="status"
      class="pointer-events-auto absolute left-3 top-3 z-[800] flex items-center gap-2 rounded-full border border-bnc-stone-200 bg-white/95 px-3 py-1.5 text-xs shadow-[var(--shadow-elevated)] backdrop-blur dark:border-bnc-stone-800 dark:bg-bnc-stone-900/95"
      role="status"
      aria-live="polite"
    >
      <span
        class="live-dot"
        :style="isLoading ? undefined : { background: 'var(--color-stale)', animation: 'none' }"
        aria-hidden
      />
      <span class="font-mono text-[11px] uppercase tracking-wider text-bnc-stone-700 dark:text-bnc-stone-200">
        {{ label }}
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
