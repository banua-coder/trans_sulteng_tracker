<script setup lang="ts">
/**
 * Printable single-page overview of all corridors for one city.
 * Mounts a dedicated Leaflet map with every corridor polyline + every
 * halte marker rendered, plus a legend and a QR code linking back to
 * the live tracker. The user prints via the browser ("Save as PDF"
 * in the print dialog) — no jsPDF/html2canvas dependency, no tile
 * CORS surprises.
 */
import '@/lib/leaflet/setup'
import L from 'leaflet'
import polyline from '@mapbox/polyline'
import QRCode from 'qrcode'
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'

import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { halteMarker } from '@/lib/leaflet/markers'
import { voyagerTiles } from '@/lib/leaflet/tiles'
import type { CitySlug } from '@/types/brt'

const props = defineProps<{ city: CitySlug }>()

const router = useRouter()
const cityStore = useCityStore()
const brt = useBrtStore()
const { corridors, halte } = storeToRefs(brt)

const mapEl = shallowRef<HTMLElement | null>(null)
const qrEl = shallowRef<HTMLCanvasElement | null>(null)
let map: L.Map | null = null

const cityName = computed(() => (props.city === 'palu' ? 'TransPalu' : 'TransDonggala'))
const todayLabel = computed(() => {
  const d = new Date()
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
})

const corridorRows = computed(() =>
  [...corridors.value]
    .sort((a, b) => a.kor.localeCompare(b.kor, undefined, { numeric: true }))
    .map((c) => ({
      kor: c.kor,
      color: c.color || '#0EA5E9',
      origin: c.origin,
      toward: c.toward,
      ops: Number(c.is_ops) === 1,
    })),
)

// Switch the city store if the route param differs so brt.loadRoutes
// fetches the right pref. (HomeView's app shell also sets this, but
// when the user lands directly on /peta/<city> via deep link the
// store may still be on its default.)
watch(
  () => props.city,
  async (slug) => {
    if (cityStore.slug !== slug) cityStore.setCity(slug)
    if (!corridors.value.length) await brt.loadRoutes(cityStore.pref)
  },
  { immediate: true },
)

const CITY_CENTER: Record<CitySlug, L.LatLngTuple> = {
  palu: [-0.86, 119.85],
  donggala: [-0.69, 119.74],
}

function drawAllCorridors() {
  if (!map) return
  const bounds = L.latLngBounds([])
  for (const c of corridors.value) {
    const color = c.color || '#0EA5E9'
    const dim = Number(c.is_ops) !== 1
    for (const enc of [c.points_a, c.points_b]) {
      if (!enc) continue
      const coords = polyline.decode(enc) as L.LatLngTuple[]
      if (!coords.length) continue
      const line = L.polyline(coords, {
        color,
        weight: dim ? 3 : 4,
        opacity: dim ? 0.55 : 0.95,
        smoothFactor: 1,
      })
      line.addTo(map)
      for (const ll of coords) bounds.extend(ll)
    }
  }
  // Halte markers with permanent name tooltips so the print is readable
  // without an interactive zoom. Tooltip positioning is approximate —
  // collisions are accepted for v1 since the print is overview-scale.
  for (const h of halte.value) {
    const lat = parseFloat(h.sh_lat)
    const lng = parseFloat(h.sh_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const m = halteMarker([lat, lng]).bindTooltip(h.sh_name, {
      permanent: true,
      direction: 'top',
      offset: [0, -6],
      className: 'export-halte-label',
    })
    m.addTo(map)
    bounds.extend([lat, lng])
  }
  if (bounds.isValid()) map.fitBounds(bounds.pad(0.05))
}

async function renderQR() {
  if (!qrEl.value) return
  const url = `${window.location.origin}/${props.city}`
  await QRCode.toCanvas(qrEl.value, url, {
    width: 140,
    margin: 1,
    color: { dark: '#0A0E14', light: '#FFFFFF' },
  })
}

onMounted(async () => {
  if (!mapEl.value) return
  map = L.map(mapEl.value, {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true,
    // Print-friendly: lock interaction so accidental drags don't
    // shift the bounds before the user prints.
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
  }).setView(CITY_CENTER[props.city], 12)
  voyagerTiles().addTo(map)

  if (corridors.value.length) drawAllCorridors()
  await renderQR()
})

watch([corridors, halte], () => {
  if (!map) return
  drawAllCorridors()
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})

function back() {
  router.push({ name: 'city', params: { city: props.city } })
}

function printPage() {
  window.print()
}
</script>

<template>
  <div class="export-page">
    <!-- screen-only toolbar -->
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
      <p class="font-display text-sm font-semibold">Peta Koridor {{ cityName }}</p>
      <button
        type="button"
        class="ml-auto inline-flex items-center gap-2 rounded-md bg-bnc-ink px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-bnc-paper transition-colors hover:bg-bnc-stone-800 dark:bg-bnc-paper dark:text-bnc-ink dark:hover:bg-bnc-stone-200"
        @click="printPage"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
          <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
        </svg>
        Cetak / Simpan PDF
      </button>
    </div>

    <!-- printable sheet — fixed landscape A4 ratio so the screen
         preview matches what comes out of the printer -->
    <article class="sheet">
      <header class="sheet-header">
        <div class="title">
          <p class="eyebrow">Peta Koridor Bus Rapid Transit</p>
          <h1>{{ cityName }}</h1>
          <p class="footnote">cektrans.banuacoder.com · diperbarui {{ todayLabel }}</p>
        </div>
        <div class="compass" aria-hidden>
          <svg viewBox="0 0 64 64" class="h-12 w-12">
            <circle cx="32" cy="32" r="30" fill="none" stroke="#0A0E14" stroke-width="1.5" />
            <polygon points="32,8 38,32 32,28 26,32" fill="#D92D20" />
            <polygon points="32,56 38,32 32,36 26,32" fill="#0A0E14" />
            <text x="32" y="6" text-anchor="middle" font-size="6" font-family="monospace" fill="#0A0E14">U</text>
          </svg>
        </div>
      </header>

      <div class="sheet-body">
        <div ref="mapEl" class="map" />
        <aside class="legend">
          <h2>Daftar Koridor</h2>
          <ul>
            <li
              v-for="r in corridorRows"
              :key="r.kor"
              :class="{ inactive: !r.ops }"
            >
              <span class="chip" :style="{ background: r.color }">{{ r.kor }}</span>
              <span class="text">{{ r.origin }} – {{ r.toward }}</span>
            </li>
          </ul>
          <div class="qr-block">
            <canvas ref="qrEl" />
            <p>Pindai untuk pelacak live</p>
          </div>
        </aside>
      </div>

      <footer class="sheet-footer">
        <span>Sumber data: gps.brtnusantara.com</span>
        <span>© {{ new Date().getFullYear() }} banuacoder.com</span>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.export-page {
  background: #f5f5f5;
  min-height: 100vh;
}

/* On-screen sheet preview — A4 landscape proportions */
.sheet {
  width: min(1123px, 100%);
  margin: 16px auto;
  aspect-ratio: 297 / 210;
  background: white;
  color: #0a0e14;
  display: grid;
  grid-template-rows: auto 1fr auto;
  box-shadow: 0 4px 24px rgba(10, 14, 20, 0.18);
  padding: 16px 20px;
  font-family: ui-sans-serif, system-ui, sans-serif;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid #0a0e14;
  padding-bottom: 8px;
  margin-bottom: 12px;
}
.title .eyebrow {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #475569;
  margin-bottom: 2px;
}
.title h1 {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.1;
}
.title .footnote {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  color: #475569;
  margin-top: 4px;
}

.sheet-body {
  display: grid;
  grid-template-columns: 1fr 240px;
  gap: 12px;
  min-height: 0;
}

.map {
  border: 1px solid #cbd5e1;
  min-height: 0;
}

.legend {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-left: 1px solid #e2e8f0;
  padding-left: 12px;
  font-size: 11px;
}
.legend h2 {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #475569;
}
.legend ul {
  display: flex;
  flex-direction: column;
  gap: 5px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.legend li {
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1.25;
}
.legend li.inactive { opacity: 0.55; }
.legend .chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: white;
}
.legend .text { color: #1e293b; }
.qr-block {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
}
.qr-block p {
  font-family: ui-monospace, monospace;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #475569;
}

.sheet-footer {
  display: flex;
  justify-content: space-between;
  font-family: ui-monospace, monospace;
  font-size: 9px;
  color: #64748b;
  border-top: 1px solid #e2e8f0;
  padding-top: 6px;
  margin-top: 6px;
}

/* Print rules — drop chrome, force colors, lock landscape */
@media print {
  @page {
    size: A4 landscape;
    margin: 8mm;
  }
  .no-print { display: none !important; }
  .export-page {
    background: white;
    min-height: 0;
  }
  .sheet {
    width: 100%;
    margin: 0;
    box-shadow: none;
    aspect-ratio: auto;
    height: 100vh;
    padding: 0;
  }
  /* Force exact color reproduction so the corridor polylines + chips
     keep their brand colors when the user prints in color mode. */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>

<style>
/* Permanent halte name tooltips on the export map. Scoped: false so
   the Leaflet tooltip DOM (rendered outside the component) picks up
   the styling. */
.export-halte-label {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #cbd5e1;
  border-radius: 3px;
  padding: 1px 4px;
  font-family: ui-monospace, monospace;
  font-size: 8px;
  font-weight: 600;
  color: #0a0e14;
  white-space: nowrap;
  box-shadow: none;
}
.export-halte-label::before { display: none; }
</style>
