<script setup lang="ts">
/**
 * Strava-style end-of-trip share card. Rendered offscreen at a
 * fixed 1080×1350 (IG story 9:16, reads cleanly on WA + Twitter).
 * Leaflet map plus the user's GPS trace overlay; ride corridor
 * colors at the top, hashtags + Banua Coder attribution at the
 * bottom. html-to-image captures this node as a PNG for sharing.
 */
import { onMounted, onBeforeUnmount, ref } from 'vue'
import L from 'leaflet'
import type { RideSummary } from '@/stores/ride'
import { SHARE_HASHTAGS } from '@/lib/share'

const props = defineProps<{ summary: RideSummary }>()

const mapEl = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null

onMounted(() => {
  if (!mapEl.value) return
  map = L.map(mapEl.value, {
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true,
  })
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(map)

  const trace = props.summary.trace
  if (trace.length >= 2) {
    const line = L.polyline(trace as L.LatLngTuple[], {
      color: props.summary.corridors[0]?.color ?? '#0EA5E9',
      weight: 5,
      opacity: 0.95,
    }).addTo(map)
    const bounds = line.getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] })
    // Start + end markers — simple dots, no popup.
    L.circleMarker(trace[0] as L.LatLngTuple, {
      radius: 8, color: '#10B981', fillColor: '#10B981', fillOpacity: 1, weight: 2,
    }).addTo(map)
    L.circleMarker(trace[trace.length - 1] as L.LatLngTuple, {
      radius: 8, color: '#EF4444', fillColor: '#EF4444', fillOpacity: 1, weight: 2,
    }).addTo(map)
  } else if (trace.length === 1) {
    map.setView(trace[0] as L.LatLngTuple, 15)
  } else {
    // No trace — fall back to a default Palu/Donggala view.
    map.setView([-0.9, 119.85], 12)
  }
  // Give Leaflet a tick to settle tile sizes inside the fixed
  // 1080-wide container.
  setTimeout(() => map?.invalidateSize(), 50)
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
})

function fmt(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}
</script>

<template>
  <article
    class="share-card flex flex-col"
    role="img"
    :aria-label="`${summary.origin} ke ${summary.destination}`"
  >
    <!-- Header. Operator logo is bundled in /public so it stays
         same-origin — the upstream BRT host doesn't serve CORS so
         html-to-image would taint the canvas reading from it. -->
    <header class="flex items-center justify-between px-8 py-6">
      <div class="flex items-center gap-4">
        <img
          v-if="summary.cityLogo"
          :src="summary.cityLogo"
          :alt="summary.operator"
          class="h-14 w-14 rounded-full bg-white object-contain p-1"
        />
        <div>
          <p class="font-mono text-[12px] uppercase tracking-widest text-bnc-stone-400">
            {{ summary.operator }}
          </p>
          <p class="font-display text-3xl font-extrabold text-white">cektrans</p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <span
          v-for="c in summary.corridors"
          :key="c.kor"
          class="inline-flex items-center rounded-md px-2 py-1 font-mono text-sm font-bold uppercase tracking-wider text-white"
          :style="{ background: c.color }"
        >
          {{ c.kor }}
        </span>
      </div>
    </header>

    <!-- Map -->
    <div class="relative mx-6 flex-1 overflow-hidden rounded-2xl">
      <div ref="mapEl" class="absolute inset-0" />
    </div>

    <!-- Body -->
    <footer class="flex flex-col gap-3 px-8 pb-6 pt-6">
      <h2 class="font-display text-3xl font-extrabold leading-tight text-white">
        {{ summary.origin }}
        <span class="text-bnc-stone-500">→</span>
        {{ summary.destination }}
      </h2>
      <div class="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-base tabular-nums text-bnc-stone-200">
        <span><span class="text-2xl font-bold text-white">{{ summary.durationMin }}</span> menit</span>
        <span>·</span>
        <span><span class="font-bold text-white">{{ fmt(summary.rideM) }}</span> bus</span>
        <span>·</span>
        <span><span class="font-bold text-white">{{ fmt(summary.walkM) }}</span> jalan</span>
      </div>
      <p class="font-mono text-[13px] tracking-tight text-bnc-stone-400">
        {{ SHARE_HASHTAGS[summary.city].join(' ') }}
      </p>

      <div class="mt-2 flex items-center justify-between border-t border-bnc-stone-700 pt-4">
        <span class="font-mono text-[11px] uppercase tracking-widest text-bnc-stone-500">
          powered by
        </span>
        <img
          src="/banuacoder-horizontal-dark.png"
          alt="Banua Coder"
          class="h-6"
          crossorigin="anonymous"
        />
      </div>
    </footer>
  </article>
</template>

<style scoped>
.share-card {
  width: 1080px;
  height: 1350px;
  background: #0A0E14;       /* bnc-ink */
  color: white;
  font-family: 'Inter Variable', system-ui, sans-serif;
}
</style>
