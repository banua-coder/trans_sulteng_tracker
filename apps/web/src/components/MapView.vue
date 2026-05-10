<script setup lang="ts">
import '@/lib/leaflet/setup'
import L from 'leaflet'
import polyline from '@mapbox/polyline'
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'

import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { useSelectionStore } from '@/stores/selection'
import { busIcon, halteMarker } from '@/lib/leaflet/markers'
import { voyagerTiles } from '@/lib/leaflet/tiles'
import { isStale } from '@/lib/format'
import type { BrtBus, BrtCorridor, BrtHalte } from '@/types/brt'

const brt = useBrtStore()
const city = useCityStore()
const selection = useSelectionStore()
const { corridors, halte, buses } = storeToRefs(brt)

const containerEl = shallowRef<HTMLElement | null>(null)
let map: L.Map | null = null
let tileLayer: L.TileLayer | null = null
const corridorLayer = L.layerGroup()
const halteLayer = L.layerGroup()
const busLayer = L.layerGroup()
const busMarkers = new Map<string, L.Marker>()

const CITY_CENTER: Record<string, L.LatLngTuple> = {
  '12': [-0.814841, 119.875584],
  '11': [-0.767792, 119.76567],
}

function initMap() {
  if (!containerEl.value || map) return

  map = L.map(containerEl.value, {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true,
  }).setView(CITY_CENTER[city.pref] ?? [-0.81, 119.85], 13)

  L.control.zoom({ position: 'bottomright' }).addTo(map)
  tileLayer = voyagerTiles().addTo(map)

  corridorLayer.addTo(map)
  halteLayer.addTo(map)
  busLayer.addTo(map)
}

function clearAll() {
  corridorLayer.clearLayers()
  halteLayer.clearLayers()
  busLayer.clearLayers()
  busMarkers.clear()
}

function drawCorridors(items: BrtCorridor[]) {
  corridorLayer.clearLayers()
  const allBounds = L.latLngBounds([])

  for (const c of items) {
    const color = c.color || '#0EA5E9'
    const dim = Number(c.is_ops) !== 1
    const segs = [c.points_a, c.points_b].filter(Boolean) as string[]
    for (const enc of segs) {
      try {
        const latlngs = polyline.decode(enc) as L.LatLngTuple[]
        if (!latlngs.length) continue
        const line = L.polyline(latlngs, {
          color,
          weight: 5,
          opacity: dim ? 0.35 : 0.85,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
        })
        line.addTo(corridorLayer)
        allBounds.extend(line.getBounds())
      } catch {
        // ignore malformed polyline
      }
    }
  }

  if (map && allBounds.isValid()) {
    map.fitBounds(allBounds.pad(0.08), { animate: false })
  }
}

function drawHalte(items: BrtHalte[]) {
  halteLayer.clearLayers()
  for (const h of items) {
    const lat = parseFloat(h.sh_lat)
    const lng = parseFloat(h.sh_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const color = (h.color && h.color !== '') ? h.color : (brt.colorForKor(h.kor) || '#0EA5E9')
    const marker = halteMarker([lat, lng], color)
      .bindTooltip(h.sh_name, { direction: 'top', offset: [0, -6] })
    marker.on('click', () => selection.selectHalte(h.sh_id))
    marker.addTo(halteLayer)
  }
}

function upsertBusMarker(b: BrtBus) {
  if (b.lat == null || b.lng == null) return
  const key = b.imei || b.id
  const color = brt.colorForKor(b.kor) || '#0EA5E9'
  const stale = isStale(b.dt_tracker)
  const icon = busIcon({ color, code: b.kor || '·', stale })
  const angle = Number.isFinite(b.angle) ? b.angle : 0

  let m = busMarkers.get(key)
  if (!m) {
    m = L.marker([b.lat, b.lng], {
      icon,
      keyboard: false,
      rotationOrigin: 'center center',
      rotationAngle: angle,
    } as L.MarkerOptions)
    m.on('click', () => selection.selectBus(key))
    m.addTo(busLayer)
    busMarkers.set(key, m)
  } else {
    m.setLatLng([b.lat, b.lng])
    m.setIcon(icon)
    m.setRotationAngle?.(angle)
  }
}

function pruneBusMarkers(active: Map<string, BrtBus>) {
  for (const key of busMarkers.keys()) {
    if (!active.has(key)) {
      const m = busMarkers.get(key)
      if (m) busLayer.removeLayer(m)
      busMarkers.delete(key)
    }
  }
}


onMounted(() => {
  initMap()
  drawCorridors(corridors.value)
  drawHalte(halte.value)
  for (const b of buses.value.values()) upsertBusMarker(b)
})

watch(
  () => city.pref,
  (pref) => {
    clearAll()
    if (map && CITY_CENTER[pref]) map.setView(CITY_CENTER[pref], 13)
  },
)

watch(
  corridors,
  (items) => {
    if (!map) return
    drawCorridors(items)
  },
  { immediate: false },
)

watch(
  halte,
  (items) => {
    if (!map) return
    drawHalte(items)
  },
  { immediate: false },
)

watch(
  buses,
  (active) => {
    if (!map) return
    for (const bus of active.values()) upsertBusMarker(bus)
    pruneBusMarkers(active)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  clearAll()
  tileLayer?.remove()
  map?.remove()
  map = null
  tileLayer = null
})
</script>

<template>
  <div ref="containerEl" class="h-full w-full" aria-label="Peta lokasi bus" role="region" />
</template>

<style scoped>
:deep(.leaflet-control-zoom) {
  border: none;
  border-radius: 9999px;
  overflow: hidden;
  box-shadow: var(--shadow-elevated);
}
:deep(.leaflet-control-zoom a) {
  background: var(--color-bnc-paper);
  color: var(--color-bnc-ink);
  border-bottom: 1px solid var(--color-bnc-stone-200);
}
html.dark :deep(.leaflet-control-zoom a) {
  background: var(--color-bnc-stone-900);
  color: var(--color-bnc-paper);
  border-bottom-color: var(--color-bnc-stone-800);
}
</style>
