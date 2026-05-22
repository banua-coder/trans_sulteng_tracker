<script setup lang="ts">
/**
 * One A4-landscape printable sheet for a single corridor. Renders its
 * own Leaflet map fitted to that corridor's bounds, marks every halte
 * (with name), highlights transfer points where two or more corridors
 * cross, lists the per-corridor halte sequence in the legend, and
 * carries a QR back to the live tracker.
 */
import '@/lib/leaflet/setup'
import L from 'leaflet'
import polyline from '@mapbox/polyline'
import QRCode from 'qrcode'
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { voyagerTiles } from '@/lib/leaflet/tiles'
import type { BrtCorridor, BrtHalte } from '@/types/brt'

const props = defineProps<{
  corridor: BrtCorridor
  halte: BrtHalte[]
  cityName: string
  qrUrl: string
  todayLabel: string
}>()

const mapEl = shallowRef<HTMLElement | null>(null)
const qrEl = shallowRef<HTMLCanvasElement | null>(null)
let map: L.Map | null = null

// One physical stop per sh_name. Order preserved from the bulk feed
// so the listing follows the forward leg roughly.
const haltePoints = computed(() => {
  const seen = new Map<string, BrtHalte>()
  for (const h of props.halte) {
    if (h.kor !== props.corridor.kor) continue
    if (!seen.has(h.sh_name)) seen.set(h.sh_name, h)
  }
  return [...seen.values()]
})

// A halte is a transfer point when in_koridor lists ≥2 corridors.
function isTransfer(h: BrtHalte): boolean {
  if (!h.in_koridor) return false
  return h.in_koridor.split('|').filter(Boolean).length > 1
}

function otherCorridorsAt(h: BrtHalte): string[] {
  if (!h.in_koridor) return []
  return h.in_koridor.split('|').filter((k) => k && k !== props.corridor.kor)
}

function drawSheet() {
  if (!map) return
  const color = props.corridor.color || '#0EA5E9'
  const bounds = L.latLngBounds([])

  // Both legs of the corridor, same color.
  for (const enc of [props.corridor.points_a, props.corridor.points_b]) {
    if (!enc) continue
    const coords = polyline.decode(enc) as L.LatLngTuple[]
    if (!coords.length) continue
    L.polyline(coords, {
      color,
      weight: 5,
      opacity: 0.95,
      smoothFactor: 1,
    }).addTo(map)
    for (const ll of coords) bounds.extend(ll)
  }

  // Halte markers + permanent name tooltips. Per-corridor count is
  // small enough (~15–25) that name labels stay readable.
  for (const h of haltePoints.value) {
    const lat = parseFloat(h.sh_lat)
    const lng = parseFloat(h.sh_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const transfer = isTransfer(h)
    L.circleMarker([lat, lng], {
      radius: transfer ? 6 : 3.5,
      color: '#0a0e14',
      weight: transfer ? 2 : 1,
      fillColor: transfer ? '#fde047' : '#ffffff',
      fillOpacity: 1,
    })
      .addTo(map)
      .bindTooltip(h.sh_name, {
        permanent: true,
        direction: 'right',
        offset: [6, 0],
        className: transfer ? 'sheet-halte-label transfer' : 'sheet-halte-label',
      })
    bounds.extend([lat, lng])
  }

  if (bounds.isValid()) map.fitBounds(bounds.pad(0.06))
}

async function renderQR() {
  if (!qrEl.value) return
  await QRCode.toCanvas(qrEl.value, props.qrUrl, {
    width: 120,
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
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
  })
  voyagerTiles().addTo(map)
  drawSheet()
  await renderQR()
})

watch(() => props.halte, () => {
  if (!map) return
  drawSheet()
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <article class="sheet">
    <header class="sheet-header">
      <div class="title">
        <p class="eyebrow">Peta Koridor · {{ cityName }}</p>
        <h1>
          <span class="chip" :style="{ background: corridor.color || '#0EA5E9' }">{{ corridor.kor }}</span>
          {{ corridor.origin }} – {{ corridor.toward }}
        </h1>
        <p class="footnote">
          cektrans.banuacoder.com · {{ todayLabel }}
          <template v-if="corridor.jam_operasional"> · {{ corridor.jam_operasional }}</template>
        </p>
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
        <section>
          <h2>Daftar Halte</h2>
          <ol>
            <li v-for="h in haltePoints" :key="h.sh_name">
              <span class="halte-name">
                {{ h.sh_name }}
                <span
                  v-if="isTransfer(h)"
                  class="transfer-pin"
                  :title="'Transfer ke ' + otherCorridorsAt(h).join(', ')"
                >★</span>
              </span>
              <span v-if="isTransfer(h)" class="transfer-list">
                <span
                  v-for="k in otherCorridorsAt(h)"
                  :key="k"
                  class="transfer-chip"
                >{{ k }}</span>
              </span>
            </li>
          </ol>
        </section>
        <section class="key">
          <h2>Keterangan</h2>
          <ul>
            <li>
              <span class="key-dot" />
              <span>Halte biasa</span>
            </li>
            <li>
              <span class="key-dot transfer" />
              <span>Transfer point (★)</span>
            </li>
          </ul>
        </section>
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
</template>

<style scoped>
.sheet {
  width: min(1123px, 100%);
  margin: 16px auto;
  aspect-ratio: 297 / 210;
  background: white;
  color: #0a0e14;
  display: grid;
  grid-template-rows: auto 1fr auto;
  box-shadow: 0 4px 24px rgba(10, 14, 20, 0.18);
  padding: 14px 18px;
  font-family: ui-sans-serif, system-ui, sans-serif;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid #0a0e14;
  padding-bottom: 8px;
  margin-bottom: 10px;
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
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.1;
}
.title .chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  height: 22px;
  padding: 0 8px;
  border-radius: 5px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: white;
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
  font-size: 10px;
  overflow: hidden;
}
.legend h2 {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #475569;
  margin-bottom: 4px;
}
.legend ol {
  list-style: decimal inside;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 100%;
  overflow: auto;
}
.legend ol li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  font-size: 10px;
  line-height: 1.25;
}
.halte-name { color: #0a0e14; }
.transfer-pin {
  color: #b45309;
  font-weight: 700;
  margin-left: 2px;
}
.transfer-list {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-left: 4px;
}
.transfer-chip {
  display: inline-block;
  background: #fde047;
  color: #422006;
  border-radius: 2px;
  padding: 0 4px;
  font-family: ui-monospace, monospace;
  font-size: 9px;
  font-weight: 700;
}

.key ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.key li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.key-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ffffff;
  border: 1px solid #0a0e14;
}
.key-dot.transfer {
  width: 12px;
  height: 12px;
  background: #fde047;
  border-width: 2px;
}

.qr-block {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding-top: 8px;
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

/* Print: one sheet per corridor, page break after each */
@media print {
  .sheet {
    width: 100%;
    margin: 0;
    box-shadow: none;
    aspect-ratio: auto;
    height: 100vh;
    padding: 0;
    page-break-after: always;
    break-after: page;
  }
  .sheet:last-of-type {
    page-break-after: auto;
    break-after: auto;
  }
}
</style>

<style>
.sheet-halte-label {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #cbd5e1;
  border-radius: 3px;
  padding: 1px 4px;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 9px;
  font-weight: 600;
  color: #0a0e14;
  white-space: nowrap;
  box-shadow: none;
}
.sheet-halte-label::before { display: none; }
.sheet-halte-label.transfer {
  background: #fde047;
  border-color: #b45309;
  color: #422006;
}
</style>
