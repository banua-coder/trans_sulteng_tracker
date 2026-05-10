<script setup lang="ts">
import '@/lib/leaflet/setup'
import L from 'leaflet'
import polyline from '@mapbox/polyline'
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'

import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { useFocusStore } from '@/stores/focus'
import { useSelectionStore } from '@/stores/selection'
import { busIcon, halteMarker } from '@/lib/leaflet/markers'
import { voyagerTiles } from '@/lib/leaflet/tiles'
import { isStale } from '@/lib/format'
import type { BrtBus, BrtCorridor, BrtHalte } from '@/types/brt'

const brt = useBrtStore()
const city = useCityStore()
const selection = useSelectionStore()
const focus = useFocusStore()
const { corridors, halte, buses } = storeToRefs(brt)

const containerEl = shallowRef<HTMLElement | null>(null)
let map: L.Map | null = null
let tileLayer: L.TileLayer | null = null
const corridorLayer = L.layerGroup()
const halteLayer = L.layerGroup()
const busLayer = L.layerGroup()
const busMarkers = new Map<string, L.Marker>()
/** Polylines tracked by corridor code so we can dim non-focused ones. */
const corridorLines = new Map<string, L.Polyline[]>()
/** CircleMarker per halte, tracked for focus dimming. */
const halteByKor = new Map<string, L.CircleMarker[]>()

const CITY_CENTER: Record<string, L.LatLngTuple> = {
  '12': [-0.814841, 119.875584],
  '11': [-0.767792, 119.76567],
}

/** While true, every fix on the selected bus auto-pans the map to keep
 *  the marker centered. The user breaks this lock by manually dragging,
 *  zooming, or by clearing the selection. */
let following = false

/** Snapshot of the map viewport before we entered bus-follow mode, so
 *  closing the bus info card returns the user to where they were. */
let priorViewport: { center: L.LatLng; zoom: number } | null = null

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

  // Any user gesture breaks the follow lock — they're navigating,
  // we shouldn't fight them.
  map.on('dragstart zoomstart', () => {
    following = false
  })
}

function clearAll() {
  corridorLayer.clearLayers()
  halteLayer.clearLayers()
  busLayer.clearLayers()
  busMarkers.clear()
  corridorLines.clear()
  halteByKor.clear()
}

function drawCorridors(items: BrtCorridor[]) {
  corridorLayer.clearLayers()
  corridorLines.clear()
  const allBounds = L.latLngBounds([])

  for (const c of items) {
    const color = c.color || '#0EA5E9'
    const dim = Number(c.is_ops) !== 1
    const segs = [c.points_a, c.points_b].filter(Boolean) as string[]
    const lines: L.Polyline[] = []
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
          interactive: true,
        })
        line.on('click', () => focus.focus(c.kor))
        line.addTo(corridorLayer)
        lines.push(line)
        allBounds.extend(line.getBounds())
      } catch {
        // ignore malformed polyline
      }
    }
    if (lines.length) corridorLines.set(c.kor, lines)
  }

  if (map && allBounds.isValid()) {
    map.fitBounds(allBounds.pad(0.08), { animate: false })
  }
  applyFocus()
}

function drawHalte(items: BrtHalte[]) {
  halteLayer.clearLayers()
  halteByKor.clear()
  for (const h of items) {
    const lat = parseFloat(h.sh_lat)
    const lng = parseFloat(h.sh_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    // Halte color tracks the corridor color so a glance tells you the route.
    // Falls back to API-supplied h.color, then a final cyan if nothing else.
    const color = brt.colorForKor(h.kor) || (h.color && h.color !== '' ? h.color : '#0EA5E9')
    const marker = halteMarker([lat, lng], color)
      .bindTooltip(h.sh_name, { direction: 'top', offset: [0, -6] })
    marker.on('click', () => selection.selectHalte(h.sh_id))
    marker.addTo(halteLayer)
    const list = halteByKor.get(h.kor) ?? []
    list.push(marker)
    halteByKor.set(h.kor, list)
  }
  applyFocus()
}

/** Re-paint corridors / halte / buses based on the current focus state. */
function applyFocus() {
  const fk = focus.kor
  // Corridors
  for (const [kor, lines] of corridorLines.entries()) {
    const c = brt.corridorByKor.get(kor)
    const baseDim = c && Number(c.is_ops) !== 1
    const dimByFocus = fk !== null && kor !== fk
    const opacity = dimByFocus ? 0.18 : baseDim ? 0.35 : 0.85
    const weight = dimByFocus ? 3 : kor === fk ? 6 : 5
    for (const ln of lines) ln.setStyle({ opacity, weight })
  }
  // Halte
  for (const [kor, marks] of halteByKor.entries()) {
    const dim = fk !== null && kor !== fk
    for (const m of marks) {
      m.setStyle({ fillOpacity: dim ? 0.25 : 1, opacity: dim ? 0.35 : 1 })
    }
  }
  // Buses
  for (const [key, m] of busMarkers.entries()) {
    const bus = brt.buses.get(key)
    if (!bus) continue
    const visible = fk === null || bus.kor === fk
    const el = m.getElement()
    if (el) el.style.opacity = visible ? '1' : '0.15'
  }
}

function upsertBusMarker(b: BrtBus) {
  if (b.lat == null || b.lng == null) return
  const key = b.imei || b.id
  const color = brt.colorForKor(b.kor) || '#0EA5E9'
  const stale = isStale(b.dt_tracker)
  const angle = Number.isFinite(b.angle) ? b.angle : 0
  const icon = busIcon({ color, code: b.kor || '·', angle, stale })

  let m = busMarkers.get(key)
  if (!m) {
    m = L.marker([b.lat, b.lng], { icon, keyboard: false })
    m.on('click', () => focusBus(key, b))
    m.addTo(busLayer)
    busMarkers.set(key, m)
  } else {
    m.setLatLng([b.lat, b.lng])
    m.setIcon(icon)
  }

  // Apply focus dimming to the (possibly new) marker.
  if (focus.kor !== null) {
    const el = m.getElement()
    if (el) el.style.opacity = b.kor === focus.kor ? '1' : '0.15'
  }

  // If this is the bus the user is following, glide the map with it.
  if (
    following &&
    selection.kind === 'bus' &&
    selection.id === key &&
    map
  ) {
    map.panTo([b.lat, b.lng], { animate: true, duration: 0.6 })
  }
}

function focusBus(key: string, _b: BrtBus) {
  // Toggle: clicking the focused bus again (or its close button) restores
  // the prior viewport via the selection watcher below.
  if (selection.kind === 'bus' && selection.id === key) {
    selection.clear()
    return
  }
  selection.selectBus(key)
}

/** When corridors arrive after some buses, rebuild every bus icon so the
 *  fallback gray gets replaced by the real corridor color + correct heading. */
function recolorAllBuses() {
  for (const bus of buses.value.values()) upsertBusMarker(bus)
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
    following = false
    focus.clear()
    if (map && CITY_CENTER[pref]) map.setView(CITY_CENTER[pref], 13)
  },
)

// When focus changes, re-apply dimming + fit to the focused corridor's bounds.
watch(
  () => [focus.kor, focus.direction] as const,
  ([fk]) => {
    applyFocus()
    if (map && fk) {
      const lines = corridorLines.get(fk)
      if (lines && lines.length) {
        const bounds = L.latLngBounds([])
        for (const ln of lines) bounds.extend(ln.getBounds())
        if (bounds.isValid()) {
          following = false
          map.flyToBounds(bounds.pad(0.12), { duration: 0.6 })
        }
      }
    }
  },
)

// Watching the selection store from the same component handles every
// way a bus can become selected (marker click, halte card "Lihat",
// focus panel, deep link). Entering bus mode snapshots the viewport;
// leaving bus mode restores it.
watch(
  () => [selection.kind, selection.id] as const,
  ([kind, id], oldValue) => {
    const prevKind = oldValue?.[0]
    if (kind === 'bus' && id) {
      const b = brt.buses.get(id)
      if (b && b.lat != null && b.lng != null && map) {
        if (prevKind !== 'bus' && !priorViewport) {
          priorViewport = { center: map.getCenter(), zoom: map.getZoom() }
        }
        following = true
        const targetZoom = Math.max(map.getZoom(), 16)
        map.flyTo([b.lat, b.lng], targetZoom, { duration: 0.6 })
      }
    } else {
      following = false
      if (prevKind === 'bus' && priorViewport && map) {
        map.flyTo(priorViewport.center, priorViewport.zoom, { duration: 0.6 })
        priorViewport = null
      }
    }
  },
)

watch(
  corridors,
  (items) => {
    if (!map) return
    drawCorridors(items)
    // Bus markers cached the fallback color before corridors arrived;
    // refresh them now that we know the real per-corridor color.
    recolorAllBuses()
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
