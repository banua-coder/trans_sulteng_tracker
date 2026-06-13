<script setup lang="ts">
/**
 * Map-overlay badge in the top-left of the map. Shows the current
 * "where are the buses?" status while the bus map is empty. Hides
 * the moment any bus arrives in the store.
 *
 * Status model (intentionally no operating-hours branch):
 *
 *   socket idle / connecting               → "Memuat data bus…"
 *   socket live + subscribe grace window   → "Memuat data bus…"
 *   socket live + grace expired, no buses  → "Menunggu data bus…"
 *   socket offline                         → "Koneksi terputus"
 *
 * We don't claim "Bus belum beroperasi" any more. The previous
 * version derived that from a hardcoded 06–18 WITA window seeded
 * from BrtRouteDto.jam_operasional, but reality is buses
 * sometimes run until ~21:00 WITA so the badge made a false claim
 * outside the upstream's nominal schedule. The honest steady-state
 * when we're connected and the upstream is quiet is "still
 * waiting".
 *
 * The 8 s subscribe grace window (owned by the socket store) keeps
 * the badge in its initial loading state long enough for the first
 * bus event to arrive — otherwise the badge would flash "waiting"
 * for a second before the first bus dropped in.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useSocketStore } from '@/stores/socket'

const { t } = useI18n()
const brt = useBrtStore()
const socket = useSocketStore()
const { buses } = storeToRefs(brt)
const { inSubscribeGrace } = storeToRefs(socket)

type Status = null | 'loading' | 'waiting' | 'offline'

const status = computed<Status>(() => {
  if (buses.value.size > 0) return null
  switch (socket.state) {
    case 'idle':
    case 'connecting':
      return 'loading'
    case 'offline':
      return 'offline'
    case 'live':
      return inSubscribeGrace.value ? 'loading' : 'waiting'
  }
  return null
})

const label = computed(() => {
  switch (status.value) {
    case 'loading':
      return t('operating.loading')
    case 'waiting':
      return t('operating.waiting')
    case 'offline':
      return t('status.offline')
    default:
      return ''
  }
})

// Dot pulses while we're actively trying / still waiting for data.
// Goes static when the connection itself is the problem (offline)
// because the dot can't promise progress that isn't happening.
const isAnimated = computed(() => status.value === 'loading' || status.value === 'waiting')
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
        :style="isAnimated ? undefined : { background: 'var(--color-stale)', animation: 'none' }"
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
