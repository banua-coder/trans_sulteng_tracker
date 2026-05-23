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

  const bounds = L.latLngBounds([])

  // 1) Planned path — corridor polyline slices + walk chords. Same
  // geometry the live trip preview draws, so the share image
  // tracks the actual route, not a chord between halte.
  for (const seg of props.summary.paths) {
    const line = L.polyline(seg.coords as L.LatLngTuple[], {
      color: seg.color,
      weight: seg.kind === 'ride' ? 7 : 4,
      opacity: seg.kind === 'ride' ? 0.95 : 0.7,
      dashArray: seg.kind === 'walk' ? '6 6' : undefined,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map)
    line.getLatLngs().forEach((ll) => bounds.extend(ll as L.LatLng))
  }

  // 2) Optional GPS trace overlay — thinner, on top of the planned
  // path. Skipped when too sparse (< 2 points).
  const trace = props.summary.trace
  if (trace.length >= 2) {
    L.polyline(trace as L.LatLngTuple[], {
      color: '#0F172A', weight: 3, opacity: 0.7, lineCap: 'round',
    }).addTo(map)
  }

  // 3) Start + end markers.
  const startPt = props.summary.paths[0]?.coords[0]
  const endSeg = props.summary.paths.at(-1)
  const endPt = endSeg?.coords[endSeg.coords.length - 1]
  if (startPt) {
    L.circleMarker(startPt as L.LatLngTuple, {
      radius: 9, color: '#fff', fillColor: '#10B981', fillOpacity: 1, weight: 3,
    }).addTo(map)
    bounds.extend(startPt as L.LatLngTuple)
  }
  if (endPt) {
    L.circleMarker(endPt as L.LatLngTuple, {
      radius: 9, color: '#fff', fillColor: '#EF4444', fillOpacity: 1, weight: 3,
    }).addTo(map)
    bounds.extend(endPt as L.LatLngTuple)
  }

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [40, 40] })
  } else {
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
