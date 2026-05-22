<script setup lang="ts">
/**
 * One printable A4 page within a corridor's booklet — header, map of
 * the corridor, side column with a slice of the halte list, optional
 * Keterangan + QR (only on the last page), and footer. Each page
 * mounts its own Leaflet instance because the print engine needs a
 * fully-rendered map per <article>; a single map can't be repeated
 * across pages.
 */
import '@/lib/leaflet/setup'
import L from 'leaflet'
import polyline from '@mapbox/polyline'
import QRCode from 'qrcode'
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { useBrtStore } from '@/stores/brt'
import { voyagerTiles } from '@/lib/leaflet/tiles'
import BanuacoderLogo from '@/components/BanuacoderLogo.vue'
import type { BrtCorridor, BrtHalte } from '@/types/brt'

const props = defineProps<{
  corridor: BrtCorridor
  /** Full ordered halte sequence for this corridor — used to find
   *  each chunk row's absolute index (so the number on the map dot
   *  matches the number in the side legend). */
  allHalte: BrtHalte[]
  /** Slice to render in the side legend on this page. */
  chunk: BrtHalte[]
  cityName: string
  cityIconUrl: string | null
  qrUrl: string
  todayLabel: string
  /** 1-based page number out of totalPages, used in the header. */
  page: number
  totalPages: number
  /** Show Keterangan + QR (only on the last page to save room). */
  showLegendExtras: boolean
}>()

const brt = useBrtStore()

const mapEl = shallowRef<HTMLElement | null>(null)
const qrEl = shallowRef<HTMLCanvasElement | null>(null)
let map: L.Map | null = null

function isTransfer(h: BrtHalte): boolean {
  return h.in_koridor ? h.in_koridor.split('|').filter(Boolean).length > 1 : false
}
function otherCorridorsAt(h: BrtHalte): string[] {
  return h.in_koridor ? h.in_koridor.split('|').filter((k) => k && k !== props.corridor.kor) : []
}

// Index of a halte in the corridor's full sequence — drives both
// the map dot number and the side legend number, so they always
// stay in sync across pages.
const indexByName = computed(() => {
  const m = new Map<string, number>()
  props.allHalte.forEach((h, i) => m.set(h.sh_name, i))
  return m
})
function indexOf(h: BrtHalte): number {
  return indexByName.value.get(h.sh_name) ?? 0
}

function drawMap() {
  if (!map) return
  const m = map
  const color = props.corridor.color || '#0EA5E9'
  const bounds = L.latLngBounds([])

  for (const enc of [props.corridor.points_a, props.corridor.points_b]) {
    if (!enc) continue
    const coords = polyline.decode(enc) as L.LatLngTuple[]
    if (!coords.length) continue
    L.polyline(coords, {
      color,
      weight: 5,
      opacity: 0.95,
      smoothFactor: 1,
    }).addTo(m)
    for (const ll of coords) bounds.extend(ll)
  }

  for (const h of props.allHalte) {
    const lat = parseFloat(h.sh_lat)
    const lng = parseFloat(h.sh_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const transfer = isTransfer(h)
    const size = transfer ? 18 : 15
    const idx = indexOf(h)
    L.marker([lat, lng], {
      interactive: false,
      icon: L.divIcon({
        className: 'sheet-halte-dot' + (transfer ? ' transfer' : ''),
        html: `<span>${idx + 1}</span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    }).addTo(m)
    bounds.extend([lat, lng])
  }

  if (bounds.isValid()) m.fitBounds(bounds.pad(0.02))
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
  drawMap()
  if (props.showLegendExtras) await renderQR()
})

watch(() => props.allHalte, () => {
  if (!map) return
  drawMap()
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
      <img
        v-if="cityIconUrl"
        :src="cityIconUrl"
        :alt="cityName + ' logo'"
        class="city-logo"
        referrerpolicy="no-referrer"
      />
      <div class="title">
        <p class="eyebrow">
          Peta Koridor · {{ cityName }}
          <template v-if="totalPages > 1">· hal. {{ page }} dari {{ totalPages }}</template>
        </p>
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
          <h2>
            Daftar Halte
            <template v-if="totalPages > 1">
              · {{ indexOf(chunk[0]) + 1 }}–{{ indexOf(chunk[chunk.length - 1]) + 1 }}
            </template>
          </h2>
          <ul class="halte-list">
            <li v-for="h in chunk" :key="h.sh_name">
              <span
                class="row-num"
                :class="{ transfer: isTransfer(h) }"
              >{{ indexOf(h) + 1 }}</span>
              <span class="halte-name">{{ h.sh_name }}</span>
              <span v-if="isTransfer(h)" class="transfer-list">
                <span
                  v-for="k in otherCorridorsAt(h)"
                  :key="k"
                  class="transfer-chip"
                  :style="{ background: brt.colorForKor(k) || '#0EA5E9' }"
                >{{ k }}</span>
              </span>
            </li>
          </ul>
        </section>
        <template v-if="showLegendExtras">
          <section class="key">
            <h2>Keterangan</h2>
            <ul>
              <li>
                <span class="key-dot" />
                <span>Halte biasa</span>
              </li>
              <li>
                <span class="key-dot transfer" />
                <span>Transfer point — kode di sampingnya menunjukkan koridor lain</span>
              </li>
            </ul>
          </section>
          <div class="qr-block">
            <canvas ref="qrEl" />
            <p>Pindai untuk pelacak live</p>
          </div>
        </template>
      </aside>
    </div>

    <footer class="sheet-footer">
      <span>Sumber data: gps.brtnusantara.com</span>
      <span class="bnc">
        <BanuacoderLogo :height="14" />
        <span>© {{ new Date().getFullYear() }} banuacoder.com</span>
      </span>
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
  gap: 12px;
  border-bottom: 2px solid #0a0e14;
  padding-bottom: 8px;
  margin-bottom: 10px;
}
.sheet-header .title { flex: 1; min-width: 0; }
.sheet-header .compass { margin-left: auto; }
.city-logo {
  width: 44px;
  height: 44px;
  object-fit: contain;
  flex-shrink: 0;
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

.halte-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 100%;
  overflow: auto;
}
.halte-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  line-height: 1.25;
}
.row-num {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #ffffff;
  border: 1.5px solid #0a0e14;
  font-family: ui-monospace, monospace;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  color: #0a0e14;
  flex-shrink: 0;
}
.row-num.transfer {
  background: #0a0e14;
  color: #ffffff;
  border-width: 2px;
}
.halte-name { color: #0a0e14; }
.transfer-list {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-left: 4px;
}
.transfer-chip {
  display: inline-block;
  color: white;
  border-radius: 2px;
  padding: 0 4px;
  font-family: ui-monospace, monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.03em;
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
  flex-shrink: 0;
}
.key-dot.transfer {
  width: 11px;
  height: 11px;
  background: #0a0e14;
  border-width: 2.5px;
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
  align-items: center;
  justify-content: space-between;
  font-family: ui-monospace, monospace;
  font-size: 9px;
  color: #64748b;
  border-top: 1px solid #e2e8f0;
  padding-top: 6px;
  margin-top: 6px;
}
.sheet-footer .bnc {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

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
}
</style>

<style>
.sheet-halte-dot {
  display: grid;
  place-items: center;
  background: #ffffff;
  border: 1.5px solid #0a0e14;
  border-radius: 999px;
  font-family: ui-monospace, monospace;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  color: #0a0e14;
  box-shadow: none;
}
.sheet-halte-dot.transfer {
  background: #0a0e14;
  color: #ffffff;
  border-width: 2px;
  font-size: 10px;
}
.sheet-halte-dot span { display: inline-block; }
</style>
