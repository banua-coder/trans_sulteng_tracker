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
import { satelliteTiles, voyagerTiles } from '@/lib/leaflet/tiles'
import { buildHalteIndex, isTransfer, otherCorridorsAt } from '@/lib/exportMap'
import BanuacoderLogo from '@/components/BanuacoderLogo.vue'
import type { BrtCorridor, BrtHalte } from '@/types/brt'

const props = defineProps<{
  corridor: BrtCorridor
  /** Which leg this page belongs to. 'a' = origin → toward
   *  (forward), 'b' = toward → origin (reverse). The map draws
   *  only this leg's polyline + halte so the fit is tight. */
  leg: 'a' | 'b'
  /** Ordered halte sequence for this leg — used to compute the
   *  per-leg index of each chunk row so the number on the map dot
   *  matches the side legend. */
  legHalte: BrtHalte[]
  /** Slice to render in the side legend on this page. */
  chunk: BrtHalte[]
  cityName: string
  cityIconUrl: string | null
  qrUrl: string
  todayLabel: string
  /** 1-based page number within this leg. */
  legPageNum: number
  legPageTotal: number
  /** Show Keterangan + QR (only on the last overall page). */
  showLegendExtras: boolean
  /** Basemap style — 'map' (CARTO Voyager) or 'satellite' (ESRI). */
  tileMode: 'map' | 'satellite'
  /** True when the viewport is phone-sized AND we're not in the
   *  brief pre-print prep window. Driven from MapExportView so the
   *  print handler can flip everyone back to desktop layout. */
  mobileLayout: boolean
}>()

const brt = useBrtStore()

const mapEl = shallowRef<HTMLElement | null>(null)
const qrEl = shallowRef<HTMLCanvasElement | null>(null)
let map: L.Map | null = null

// Index of a halte in this LEG's sequence — drives the number on
// the map dot and the side legend so they always match.
const indexByName = computed(() => buildHalteIndex(props.legHalte))
function indexOf(h: BrtHalte): number {
  return indexByName.value.get(h.sh_name) ?? 0
}
function legTransfersFor(h: BrtHalte): string[] {
  return otherCorridorsAt(h, props.corridor.kor)
}

// Canonical corridor title — always origin – toward regardless of
// which leg this page is rendering. Direction is communicated by
// the "Arah A/B" tag in the eyebrow so the title stays a stable
// identifier across pages.
const titleLabel = computed(
  () => `${props.corridor.origin} – ${props.corridor.toward}`,
)

function drawMap() {
  if (!map) return
  const m = map
  // Wipe any layers from a prior draw so we don't pile duplicate
  // polylines / markers on top of each other on resize.
  for (const l of drawnLayers) l.remove()
  drawnLayers = []
  const color = props.corridor.color || '#0EA5E9'
  // Bound to halte coords only. The polyline can carry detour
  // vertices that extend far beyond any actual stop (depot links,
  // bad data points) — including those vertices in the fit was
  // pushing the centered bounds offshore into Palu Bay and leaving
  // the corridor stuck on one edge of the frame.
  const bounds = L.latLngBounds([])

  // Draw ONLY this leg's polyline so the route line hugs one
  // direction's geometry instead of overlaying both legs.
  const encoded = props.leg === 'a' ? props.corridor.points_a : props.corridor.points_b
  if (encoded) {
    const coords = polyline.decode(encoded) as L.LatLngTuple[]
    if (coords.length) {
      const line = L.polyline(coords, {
        color,
        weight: 5,
        opacity: 0.95,
        smoothFactor: 1,
      }).addTo(m)
      drawnLayers.push(line)
    }
  }

  for (const h of props.legHalte) {
    const lat = parseFloat(h.sh_lat)
    const lng = parseFloat(h.sh_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const transfer = isTransfer(h)
    const size = transfer ? 18 : 15
    const idx = indexOf(h)
    const marker = L.marker([lat, lng], {
      interactive: false,
      icon: L.divIcon({
        className: 'sheet-halte-dot' + (transfer ? ' transfer' : ''),
        html: `<span>${idx + 1}</span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    }).addTo(m)
    drawnLayers.push(marker)
    bounds.extend([lat, lng])
  }

  if (bounds.isValid()) {
    // Pixel-based padding so the marker circles (radius ~9 px) never
    // crop at the edges. A fractional pad(0.01) was less than the
    // marker radius, so dots near the leg's east/west extremes
    // showed as half-circles. maxZoom caps fits for very short
    // legs so we don't zoom past readable street detail.
    m.fitBounds(bounds, {
      paddingTopLeft: [20, 20],
      paddingBottomRight: [20, 20],
      maxZoom: 16,
    })
  }
}

async function renderQR() {
  if (!qrEl.value) return
  await QRCode.toCanvas(qrEl.value, props.qrUrl, {
    width: 120,
    margin: 1,
    color: { dark: '#0A0E14', light: '#FFFFFF' },
  })
}

// Layers added by drawMap. Tracked so successive redraws (mobile/
// desktop layout switch, halte updates) can remove the old set
// before adding the new — without this, every redraw stacks fresh
// polyline + N markers onto the layer container and leaks DOM nodes.
let drawnLayers: L.Layer[] = []
let tileLayer: L.TileLayer | null = null

function makeTileLayer(): L.TileLayer {
  return props.tileMode === 'satellite' ? satelliteTiles() : voyagerTiles()
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
  tileLayer = makeTileLayer().addTo(map)
  drawMap()
  await renderQR()
  // Custom resize event fired by MapExportView during print prep so
  // each map re-projects + refits at the new container size.
  mapEl.value.addEventListener('cektrans:resize', handleResize)
})

function handleResize() {
  if (!map) return
  map.invalidateSize({ animate: false })
  drawMap()
}

watch(() => props.tileMode, () => {
  if (!map) return
  if (tileLayer) {
    tileLayer.remove()
    tileLayer = null
  }
  tileLayer = makeTileLayer().addTo(map)
})

watch(() => props.legHalte, () => {
  if (!map) return
  drawMap()
})

// When mobileLayout flips (e.g. user taps Cetak which forces desktop
// layout briefly), the .map element resizes. Leaflet caches the
// container size at init and won't notice; invalidateSize forces a
// re-measure + tile reload + refit.
watch(() => props.mobileLayout, () => {
  if (!map) return
  // Give the DOM one frame to apply the new CSS dimensions before
  // measuring.
  requestAnimationFrame(() => handleResize())
})

onBeforeUnmount(() => {
  if (mapEl.value) {
    mapEl.value.removeEventListener('cektrans:resize', handleResize)
  }
  drawnLayers = []
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <article class="sheet" :class="{ 'is-mobile': mobileLayout }">
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
          Peta Koridor · {{ cityName }} · Arah {{ leg === 'a' ? 'A' : 'B' }}
          <template v-if="legPageTotal > 1">· hal. {{ legPageNum }}/{{ legPageTotal }}</template>
        </p>
        <h1>
          <span class="chip" :style="{ background: corridor.color || '#0EA5E9' }">{{ corridor.kor }}</span>
          {{ titleLabel }}
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
            <template v-if="legPageTotal > 1">
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
                  v-for="k in legTransfersFor(h)"
                  :key="k"
                  class="transfer-chip"
                  :style="{ background: brt.colorForKor(k) || '#0EA5E9' }"
                >{{ k }}</span>
              </span>
            </li>
          </ul>
        </section>
        <section v-if="showLegendExtras" class="key">
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

/* Mobile preview: drop the A4 aspect ratio (which would collapse the
   sheet to ~280px tall on a phone and make the map unreadable) and
   stack header/map/legend vertically. Driven by the .is-mobile class
   from MapExportView (instead of a media query) so the parent can
   temporarily restore desktop layout during print prep. */
.sheet.is-mobile {
  aspect-ratio: auto;
  padding: 12px;
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

.sheet.is-mobile .sheet-body {
  grid-template-columns: 1fr;
  gap: 10px;
}
.sheet.is-mobile .map {
  height: 60vh;
}
.sheet.is-mobile .legend {
  border-left: none;
  border-top: 1px solid #e2e8f0;
  padding-left: 0;
  padding-top: 10px;
  overflow: visible;
}
.sheet.is-mobile .halte-list { max-height: none; overflow: visible; }

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
