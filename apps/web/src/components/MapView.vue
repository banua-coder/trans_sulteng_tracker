<script setup lang="ts">
import '@/lib/leaflet/setup'
import L from 'leaflet'
import polyline from '@mapbox/polyline'
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'

import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { useFocusStore } from '@/stores/focus'
import { useGeoStore } from '@/stores/geo'
import { useSelectionStore } from '@/stores/selection'
import { busIcon, halteMarker } from '@/lib/leaflet/markers'
import { darkMatterTiles, voyagerTiles } from '@/lib/leaflet/tiles'
import { useTheme } from '@/lib/theme'
import { isStale } from '@/lib/format'
import { trackEvent } from '@/lib/analytics'
import type { BrtBus, BrtCorridor, BrtHalte } from '@/types/brt'

const brt = useBrtStore()
const city = useCityStore()
const selection = useSelectionStore()
const focus = useFocusStore()
const geo = useGeoStore()
const { isDark } = useTheme()
const { corridors, halte, buses } = storeToRefs(brt)

const containerEl = shallowRef<HTMLElement | null>(null)
let map: L.Map | null = null
let tileLayer: L.TileLayer | null = null
const corridorLayer = L.layerGroup()
const halteLayer = L.layerGroup()
const busLayer = L.layerGroup()
const meLayer = L.layerGroup()
let meMarker: L.Marker | null = null
let meAccuracyCircle: L.Circle | null = null

/** Per-bus marker cache. We keep an `iconKey` so we can skip the
 *  expensive `setIcon` (which detaches + recreates the divIcon DOM)
 *  when only the position changed. `lastReceivedAt` lets the watcher
 *  diff which buses actually had a fresh fix — without this, every
 *  bus update re-renders every marker. */
interface BusMarkerCache {
  marker: L.Marker
  iconKey: string
}
const busMarkers = new Map<string, BusMarkerCache>()
const lastReceivedAt = new Map<string, number>()

/** Polylines and halte tracked per (kor, leg) so the A↔B toggle can fit
 *  the map to one leg even though styling stays per-corridor. */
type Leg = 'a' | 'b'
const corridorLines = new Map<string, Record<Leg, L.Polyline[]>>()
const halteByLeg = new Map<string, Record<Leg, L.CircleMarker[]>>()

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
  tileLayer = (isDark.value ? darkMatterTiles() : voyagerTiles()).addTo(map)

  corridorLayer.addTo(map)
  halteLayer.addTo(map)
  busLayer.addTo(map)
  meLayer.addTo(map)

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
  halteByLeg.clear()
}

function drawCorridors(items: BrtCorridor[]) {
  corridorLayer.clearLayers()
  corridorLines.clear()
  const allBounds = L.latLngBounds([])

  for (const c of items) {
    const color = c.color || '#0EA5E9'
    const dim = Number(c.is_ops) !== 1
    const byLeg: Record<Leg, L.Polyline[]> = { a: [], b: [] }
    const legs: { leg: Leg; enc: string }[] = []
    if (c.points_a) legs.push({ leg: 'a', enc: c.points_a })
    if (c.points_b) legs.push({ leg: 'b', enc: c.points_b })

    for (const { leg, enc } of legs) {
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
        byLeg[leg].push(line)
        allBounds.extend(line.getBounds())
      } catch {
        // ignore malformed polyline
      }
    }
    if (byLeg.a.length || byLeg.b.length) corridorLines.set(c.kor, byLeg)
  }

  if (map && allBounds.isValid()) {
    map.fitBounds(allBounds.pad(0.08), { animate: false })
  }
  applyFocus()
}

/** Which leg of the corridor a halte belongs to.
 *  Leg A = halte travelling FROM corridor.origin TO corridor.toward.
 *  Leg B = the reverse. Some halte have null/empty origin or toward,
 *  in which case we default to leg A. */
function halteLeg(h: BrtHalte, c: BrtCorridor | undefined): Leg {
  if (!c) return 'a'
  if (h.origin === c.origin && h.toward === c.toward) return 'a'
  if (h.origin === c.toward && h.toward === c.origin) return 'b'
  return 'a'
}

function drawHalte(items: BrtHalte[]) {
  halteLayer.clearLayers()
  halteByLeg.clear()
  for (const h of items) {
    const lat = parseFloat(h.sh_lat)
    const lng = parseFloat(h.sh_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const c = brt.corridorByKor.get(h.kor)
    const marker = halteMarker([lat, lng], '#64748b')
      .bindTooltip(h.sh_name, { direction: 'top', offset: [0, -6] })
    marker.on('click', () => selection.selectHalte(h.sh_id))
    marker.addTo(halteLayer)
    const leg = halteLeg(h, c)
    const slot = halteByLeg.get(h.kor) ?? { a: [], b: [] }
    slot[leg].push(marker)
    halteByLeg.set(h.kor, slot)
  }
  applyFocus()
}

/** Re-paint corridors / halte / buses based on the current focus state.
 *
 *  No focus           → original API color, all visible.
 *  Corridor K focused → K stays at full opacity in its API color, with
 *                        slightly heavier polyline weight. Everything
 *                        else fades to ~10% so the focused route is
 *                        clearly the headliner. */
function applyFocus() {
  const fk = focus.kor

  // Corridors
  for (const [kor, byLeg] of corridorLines.entries()) {
    const c = brt.corridorByKor.get(kor)
    const baseColor = c?.color || '#0EA5E9'
    const baseDim = c && Number(c.is_ops) !== 1
    const all = [...byLeg.a, ...byLeg.b]

    if (fk === null) {
      const opacity = baseDim ? 0.35 : 0.85
      for (const ln of all) ln.setStyle({ color: baseColor, opacity, weight: 5 })
    } else if (kor === fk) {
      for (const ln of all) ln.setStyle({ color: baseColor, opacity: 0.95, weight: 6 })
    } else {
      for (const ln of all) ln.setStyle({ color: baseColor, opacity: 0.1, weight: 2 })
    }
  }

  // Halte — unified neutral color; only opacity changes with focus
  for (const [kor, byLeg] of halteByLeg.entries()) {
    const all = [...byLeg.a, ...byLeg.b]
    if (fk === null || kor === fk) {
      for (const m of all)
        m.setStyle({ fillColor: '#64748b', color: '#fff', fillOpacity: 1, opacity: 1 })
    } else {
      for (const m of all)
        m.setStyle({ fillColor: '#64748b', fillOpacity: 0.18, opacity: 0.25 })
    }
  }

  // Buses
  for (const bus of brt.buses.values()) upsertBusMarker(bus)
}

function busColorFor(b: BrtBus): string {
  return brt.colorForKor(b.kor) || '#0EA5E9'
}

/** Element opacity: full when no focus or on-focused-corridor, faded
 *  otherwise so the focused corridor's buses are the obvious read. */
function busOpacityFor(b: BrtBus): string {
  const fk = focus.kor
  if (fk === null || b.kor === fk) return '1'
  return '0.18'
}

function upsertBusMarker(b: BrtBus) {
  if (b.lat == null || b.lng == null) return
  const key = b.imei || b.id
  const color = busColorFor(b)
  const stale = isStale(b)
  const angle = Number.isFinite(b.angle) ? b.angle : 0
  // Bucket the heading to 10° so GPS jitter doesn't churn the icon.
  const angleBucket = Math.round(angle / 10) * 10
  const iconKey = `${color}|${b.kor || '·'}|${stale ? 1 : 0}|${angleBucket}`

  let cache = busMarkers.get(key)
  if (!cache) {
    const icon = busIcon({ color, code: b.kor || '·', angle, stale })
    const marker = L.marker([b.lat, b.lng], { icon, keyboard: false })
    marker.on('click', () => focusBus(key, b))
    marker.addTo(busLayer)
    cache = { marker, iconKey }
    busMarkers.set(key, cache)
  } else {
    cache.marker.setLatLng([b.lat, b.lng])
    // Only rebuild the DivIcon when the visual state actually changed
    // (corridor color, kor label, stale flag, or heading bucket).
    // Position-only updates skip setIcon entirely.
    if (cache.iconKey !== iconKey) {
      cache.marker.setIcon(
        busIcon({ color, code: b.kor || '·', angle, stale }),
      )
      cache.iconKey = iconKey
    }
  }

  const m = cache.marker
  // Visibility per current focus state.
  const el = m.getElement()
  if (el) {
    const op = busOpacityFor(b)
    if (el.style.opacity !== op) el.style.opacity = op
    const pe = op === '0' ? 'none' : ''
    if (el.style.pointerEvents !== pe) el.style.pointerEvents = pe
  }

  // Bring focused / selected buses to the top of the marker pane so they
  // never get hidden behind another marker.
  let z = 0
  if (focus.kor && b.kor === focus.kor) z = 500
  if (selection.kind === 'bus' && selection.id === key) z = 1500
  m.setZIndexOffset(z)

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
  trackEvent('bus_follow', { kor: _b.kor ?? '', source: 'marker' })
}

/** When corridors arrive after some buses, rebuild every bus icon so the
 *  fallback gray gets replaced by the real corridor color + correct heading. */
function recolorAllBuses() {
  for (const bus of buses.value.values()) upsertBusMarker(bus)
}

function pruneBusMarkers(active: Map<string, BrtBus>) {
  for (const key of busMarkers.keys()) {
    if (!active.has(key)) {
      const cache = busMarkers.get(key)
      if (cache) busLayer.removeLayer(cache.marker)
      busMarkers.delete(key)
      lastReceivedAt.delete(key)
    }
  }
}


let staleTicker: number | undefined
let resizeObserver: ResizeObserver | undefined
let resizeFrame: number | null = null

onMounted(() => {
  initMap()
  drawCorridors(corridors.value)
  drawHalte(halte.value)
  for (const b of buses.value.values()) upsertBusMarker(b)
  renderMe()

  // isStale() flips on time-based thresholds even when no new payload
  // arrives, so re-render every bus icon on a 15s tick to keep the
  // stale visuals correct.
  staleTicker = window.setInterval(() => {
    for (const bus of brt.buses.values()) upsertBusMarker(bus)
  }, 15_000)

  // Container size changes (e.g. the mobile bottom sheet drags
  // between snap states) need to be reflected back to Leaflet so
  // its internal pane sizes match. invalidateSize on a rAF coalesces
  // bursts during the drag.
  if (containerEl.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (resizeFrame != null) cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null
        map?.invalidateSize({ animate: false })
      })
    })
    resizeObserver.observe(containerEl.value)
  }
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

// Render the user's current location whenever geolocation grants it,
// then on every subsequent fix update the marker + accuracy circle.
function renderMe() {
  const pos = geo.position
  if (!map) return
  if (!pos) {
    if (meMarker) {
      meLayer.removeLayer(meMarker)
      meMarker = null
    }
    if (meAccuracyCircle) {
      meLayer.removeLayer(meAccuracyCircle)
      meAccuracyCircle = null
    }
    return
  }
  const latlng: L.LatLngTuple = [pos.lat, pos.lng]
  if (!meMarker) {
    const icon = L.divIcon({
      className: 'me-marker',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      html: '<span class="me-pulse"></span><span class="me-disc"></span>',
    })
    meMarker = L.marker(latlng, { icon, keyboard: false, interactive: false })
    meMarker.addTo(meLayer)
  } else {
    meMarker.setLatLng(latlng)
  }
  // Accuracy circle (in meters), if reasonable.
  if (Number.isFinite(pos.accuracy) && pos.accuracy > 0 && pos.accuracy < 2_000) {
    if (!meAccuracyCircle) {
      meAccuracyCircle = L.circle(latlng, {
        radius: pos.accuracy,
        weight: 1,
        color: '#1D9CD4',
        fillColor: '#1D9CD4',
        fillOpacity: 0.08,
        opacity: 0.4,
        interactive: false,
      })
      meAccuracyCircle.addTo(meLayer)
    } else {
      meAccuracyCircle.setLatLng(latlng)
      meAccuracyCircle.setRadius(pos.accuracy)
    }
  }
}

watch(
  () => geo.position,
  (pos, prev) => {
    renderMe()
    // First successful fix: fly to it so the user sees themselves.
    if (map && pos && !prev) {
      const targetZoom = Math.max(map.getZoom(), 15)
      following = false
      map.flyTo([pos.lat, pos.lng], targetZoom, { duration: 0.6 })
    }
  },
)

// Swap the basemap when the theme toggles.
watch(isDark, (dark) => {
  if (!map) return
  if (tileLayer) tileLayer.remove()
  tileLayer = (dark ? darkMatterTiles() : voyagerTiles()).addTo(map)
})

// When focus changes, re-apply dimming + fit to the focused corridor's bounds.
watch(
  () => [focus.kor, focus.direction] as const,
  ([fk, dir], oldValue) => {
    applyFocus()
    if (fk && oldValue?.[0] !== fk) {
      trackEvent('corridor_focus', { kor: fk, dir: String(dir) })
    }
    if (map && fk) {
      const byLeg = corridorLines.get(fk)
      const all = byLeg ? [...byLeg.a, ...byLeg.b] : []
      if (all.length) {
        const bounds = L.latLngBounds([])
        for (const ln of all) bounds.extend(ln.getBounds())
        if (bounds.isValid()) {
          following = false
          map.flyToBounds(bounds.pad(0.12), { duration: 0.6 })
        }
      }
    }
  },
)

// Watching the selection store from the same component handles every
// way a bus or halte can become selected (marker click, focus panel
// "Lihat", deep link). Entering a detail mode snapshots the viewport;
// leaving it restores the snapshot.
watch(
  () => [selection.kind, selection.id] as const,
  ([kind, id], oldValue) => {
    const prevKind = oldValue?.[0]
    const isModal = kind === 'bus' || kind === 'halte'
    const wasModal = prevKind === 'bus' || prevKind === 'halte'

    if (isModal) {
      if (!wasModal && !priorViewport && map) {
        priorViewport = { center: map.getCenter(), zoom: map.getZoom() }
      }
    }

    if (kind === 'bus' && id) {
      const b = brt.buses.get(id)
      if (b && b.lat != null && b.lng != null && map) {
        following = true
        const targetZoom = Math.max(map.getZoom(), 16)
        map.flyTo([b.lat, b.lng], targetZoom, { duration: 0.6 })
      }
    } else if (kind === 'halte' && id) {
      following = false
      const h = brt.halte.find((x) => x.sh_id === id)
      if (h && map) {
        const hLat = typeof h.sh_lat === 'string' ? parseFloat(h.sh_lat) : h.sh_lat
        const hLng = typeof h.sh_lng === 'string' ? parseFloat(h.sh_lng) : h.sh_lng
        if (Number.isFinite(hLat) && Number.isFinite(hLng)) {
          const targetZoom = Math.max(map.getZoom(), 16)
          map.flyTo([hLat as number, hLng as number], targetZoom, { duration: 0.6 })
        }
      }
    } else {
      following = false
      if (wasModal && priorViewport && map) {
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
    // Only re-render markers whose `_receivedAt` advanced since the
    // last time we drew them. Without this every single bus upsert
    // re-renders every marker (~20-bus city = 400 marker updates per
    // upstream tick), which is what made the map laggy.
    for (const [key, bus] of active) {
      const recv = bus._receivedAt ?? 0
      if (lastReceivedAt.get(key) === recv) continue
      lastReceivedAt.set(key, recv)
      upsertBusMarker(bus)
    }
    pruneBusMarkers(active)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  if (staleTicker) window.clearInterval(staleTicker)
  staleTicker = undefined
  if (resizeFrame != null) cancelAnimationFrame(resizeFrame)
  resizeObserver?.disconnect()
  resizeObserver = undefined
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
