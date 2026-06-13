<script setup lang="ts">
/**
 * Thin chrome strip that shows the current WITA wall-clock time.
 *
 * Previously this banner also claimed "Bus beroperasi sekarang" /
 * "Bus belum beroperasi" + "Jam operasi 06.00–18.00 WITA" based on
 * a hardcoded window seeded from BrtRouteDto.jam_operasional. The
 * window is wrong — buses sometimes run past 18:00 WITA — so the
 * "belum beroperasi" claim was false outside the upstream's
 * nominal schedule. Stripped those claims; the BusDataBadge over
 * the map already reflects the actual data state honestly.
 *
 * Kept the time pill because the app is opened by users across
 * timezones and a WITA clock anchor is a useful glance.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatWita, operatingState } from '@/lib/operating'

const now = ref<Date>(new Date())
let timer: number | undefined

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date()
  }, 30_000)
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

const wita = computed(() => formatWita(operatingState(now.value)))
</script>

<template>
  <div
    class="flex items-center gap-2 border-b border-bnc-stone-200 bg-bnc-stone-50 px-4 py-2 text-xs dark:border-bnc-stone-800 dark:bg-bnc-stone-900"
  >
    <span class="font-mono text-[11px] uppercase tracking-wider text-bnc-stone-600 dark:text-bnc-stone-300">
      {{ wita }}
    </span>
  </div>
</template>
