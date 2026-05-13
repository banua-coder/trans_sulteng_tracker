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
import { useTripStore } from '@/stores/trip'
import type { PlanResult } from '@/lib/tripPlanner'
import { busIcon, halteHaloMarker, halteMarker } from '@/lib/leaflet/markers'
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
const trip = useTripStore()
const { isDark } = useTheme()
const { corridors, halte, buses } = storeToRefs(brt)
const { selectedPlan: tripSelectedPlan, origin: tripOrigin, destination: tripDestination } = storeToRefs(trip)

const containerEl = shallowRef<HTMLElement | null>(null)
let map: L.Map | null = null
let tileLayer: L.TileLayer | null = null
const corridorLayer = L.layerGroup()
const halteLayer = L.layerGroup()
const busLayer = L.layerGroup()
const meLayer = L.layerGroup()
const tripPreviewLayer = L.layerGroup()
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
/** Dedup map: coord key → marker instance. Prevents drawing multiple
 *  overlapping icons when several corridors share a physical stop. */
const halteSeen = new Map<string, L.CircleMarker>()
/** Reverse map: marker → set of kor codes that use this stop. Used by
 *  applyFocus to show/dim correctly when a corridor is focused. */
const halteMarkerKors = new Map<L.CircleMarker, Set<string>>()
/** Reverse map: marker → set of sh_ids that share this physical stop.
 *  Lets the bus-spotlight pass identify which markers are "upcoming"
 *  on the selected bus's leg vs already-passed. */
const halteMarkerShIds = new Map<L.CircleMarker, Set<string>>()
/** The currently highlighted halte marker, if any. Tracked separately
 *  from selection.id because markers are dedup'd by coordinate, so the
 *  same marker can serve multiple sh_id values. */
let selectedHalteMarker: L.CircleMarker | null = null
let selectedHalteHalo: L.Marker | null = null

function applySelectedHalte() {
  if (selectedHalteMarker) {
    selectedHalteMarker.setStyle({ radius: 5, fillColor: '#94a3b8', weight: 2 })
    selectedHalteMarker = null
  }
  if (selectedHalteHalo) {
    selectedHalteHalo.remove()
    selectedHalteHalo = null
  }
  if (selection.kind !== 'halte' || !selection.id) return
  const h = brt.halte.find((x) => x.sh_id === selection.id)
  if (!h) return
  const lat = parseFloat(h.sh_lat)
  const lng = parseFloat(h.sh_lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
  const coordKey = `${lat.toFixed(5)},${lng.toFixed(5)}`
  const marker = halteSeen.get(coordKey)
  if (!marker) return
  marker.setStyle({ radius: 8, fillColor: '#1D9CD4', weight: 2.5 })
  marker.bringToFront()
  selectedHalteMarker = marker
  if (map) {
    selectedHalteHalo = halteHaloMarker([lat, lng]).addTo(map)
  }
}

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
  tripPreviewLayer.addTo(map)

  // Any user gesture breaks the follow lock — they're navigating,
  // we shouldn't fight them.
  map.on('dragstart zoomstart', () => {
    following = false
  })

  // Halte pile up into illegible clutter at overview zoom levels — and
  // styling them on every focus change costs more than it earns when
  // the user can't read them anyway. Detach the layer below zoom 12.
  syncHalteVisibility()
  map.on('zoomend', syncHalteVisibility)
}

const HALTE_MIN_ZOOM = 12
let halteLayerAttached = true
function syncHalteVisibility() {
  if (!map) return
  const visible = map.getZoom() >= HALTE_MIN_ZOOM
  if (visible && !halteLayerAttached) {
    halteLayer.addTo(map)
    halteLayerAttached = true
  } else if (!visible && halteLayerAttached) {
    map.removeLayer(halteLayer)
    halteLayerAttached = false
  }
}

function clearAll() {
  corridorLayer.clearLayers()
  halteLayer.clearLayers()
  busLayer.clearLayers()
  busMarkers.clear()
  corridorLines.clear()
  halteByLeg.clear()
  halteSeen.clear()
  halteMarkerKors.clear()
  tripPreviewLayer.clearLayers()
}

/** Draw a saved Plan onto the map:
 *   - Walk legs as dashed gray polylines.
 *   - Ride legs as bright corridor-colored polylines between halte (a
 *     straight segment between halte coords — keeps draw cost low; the
 *     underlying corridor polyline is already on the map).
 *   - Origin + destination pins (cyan + red).
 *   - Numbered red discs at each halte node the bus passes.
 *  Fits the map viewport to the plan bounds.
 *  Pass null to clear the layer. */
function drawTripPreview(plan: PlanResult | null) {
  tripPreviewLayer.clearLayers()
  if (!plan || !map) return

  const bounds = L.latLngBounds([])

  const originPt = tripOrigin.value?.point
  const destPt = tripDestination.value?.point

  if (originPt) {
    bounds.extend([originPt.lat, originPt.lng])
    L.circleMarker([originPt.lat, originPt.lng], {
      radius: 8,
      color: '#fff',
      weight: 3,
      fillColor: 'var(--color-bnc-accent)' === 'var(--color-bnc-accent)' ? '#1D9CD4' : '#1D9CD4',
      fillOpacity: 1,
    }).addTo(tripPreviewLayer)
  }
  if (destPt) {
    bounds.extend([destPt.lat, destPt.lng])
    L.circleMarker([destPt.lat, destPt.lng], {
      radius: 8,
      color: '#fff',
      weight: 3,
      fillColor: '#dc2626',
      fillOpacity: 1,
    }).addTo(tripPreviewLayer)
  }

  // Iterate plan.nodes pairs and draw segments. The first / last node
  // are virtual; walk to/from real halte using origin/dest points.
  let stepCursor = 0
  for (let i = 0; i < plan.nodes.length - 1; i++) {
    const fromId = plan.nodes[i]
    const toId = plan.nodes[i + 1]
    const fromCoord = nodeCoord(fromId, originPt, destPt)
    const toCoord = nodeCoord(toId, originPt, destPt)
    if (!fromCoord || !toCoord) continue
    bounds.extend(fromCoord)
    bounds.extend(toCoord)

    const step = plan.steps[stepCursor]
    const kind = step?.kind ?? 'ride'

    if (kind === 'walk') {
      L.polyline([fromCoord, toCoord], {
        color: '#6b7280',
        weight: 4,
        opacity: 0.7,
        dashArray: '6 6',
        lineCap: 'round',
      }).addTo(tripPreviewLayer)
    } else if (kind === 'ride') {
      const color = step.kor ? (brt.colorForKor(step.kor) || '#1D9CD4') : '#1D9CD4'
      L.polyline([fromCoord, toCoord], {
        color,
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
      }).addTo(tripPreviewLayer)
    }
    // 'transfer' edges connect two nodes at the same physical stop —
    // skip drawing; the user's eye sees a colour change at the disc.

    // The step cursor only advances when we cross a step boundary,
    // which happens for every edge in plan.nodes (collapseToSteps
    // groups consecutive ride hops but the underlying node list still
    // walks each hop). To stay in sync with steps we step once per
    // ride edge group: detect when the next edge changes its character.
    if (i + 2 < plan.nodes.length) {
      const nextFrom = plan.nodes[i + 1]
      const nextTo = plan.nodes[i + 2]
      if (segmentKind(fromId, toId) !== segmentKind(nextFrom, nextTo)) stepCursor++
    }
  }

  // Numbered halte discs for each halte node along the path (skip
  // virtual start/dest).
  let counter = 1
  for (const id of plan.nodes) {
    if (id === '__start__' || id === '__dest__') continue
    const sh_id = id.split('|')[1]
    const h = brt.halte.find((x) => x.sh_id === sh_id)
    if (!h) continue
    const lat = parseFloat(h.sh_lat)
    const lng = parseFloat(h.sh_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    bounds.extend([lat, lng])
    L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'trip-step-disc',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        html: `<span>${counter}</span>`,
      }),
      keyboard: false,
      interactive: false,
    }).addTo(tripPreviewLayer)
    counter++
  }

  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.2), { duration: 0.6, animate: true })
  }
}

function nodeCoord(
  id: string,
  originPt: { lat: number; lng: number } | undefined,
  destPt: { lat: number; lng: number } | undefined,
): L.LatLngTuple | null {
  if (id === '__start__') return originPt ? [originPt.lat, originPt.lng] : null
  if (id === '__dest__') return destPt ? [destPt.lat, destPt.lng] : null
  const sh_id = id.split('|')[1]
  const h = brt.halte.find((x) => x.sh_id === sh_id)
  if (!h) return null
  const lat = parseFloat(h.sh_lat)
  const lng = parseFloat(h.sh_lng)
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null
}

function segmentKind(fromId: string, toId: string): 'walk' | 'ride' | 'transfer' {
  if (fromId === '__start__' || toId === '__dest__') return 'walk'
  const fromKor = fromId.split('|')[0]
  const toKor = toId.split('|')[0]
  if (fromKor !== toKor) return 'transfer'
  return 'ride'
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
  applyFocus(true)
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
  halteSeen.clear()
  halteMarkerKors.clear()
  halteMarkerShIds.clear()

  const fk = focus.kor
  let effectiveItems = items
  if (fk) {
    const corridor = brt.corridorByKor.get(fk)
    if (corridor) {
      const legA = brt.getHalteForLeg(fk, corridor.toward, corridor.origin)
      const legB = brt.getHalteForLeg(fk, corridor.origin, corridor.toward)
      const perLeg = [...legA, ...legB]
      if (perLeg.length > 0) {
        // Replace bulk halte for the focused corridor with per-leg data.
        effectiveItems = [...items.filter((h) => h.kor !== fk), ...perLeg]
      }
    }
  }

  for (const h of effectiveItems) {
    const lat = parseFloat(h.sh_lat)
    const lng = parseFloat(h.sh_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const coordKey = `${lat.toFixed(5)},${lng.toFixed(5)}`
    let marker = halteSeen.get(coordKey)
    if (!marker) {
      marker = halteMarker([lat, lng])
        .bindTooltip(h.sh_name, { direction: 'top', offset: [0, -6] })
      marker.on('click', () => selection.selectHalte(h.sh_id))
      marker.addTo(halteLayer)
      halteSeen.set(coordKey, marker)
    }
    const kors = halteMarkerKors.get(marker) ?? new Set<string>()
    kors.add(h.kor)
    halteMarkerKors.set(marker, kors)
    const shIds = halteMarkerShIds.get(marker) ?? new Set<string>()
    shIds.add(h.sh_id)
    halteMarkerShIds.set(marker, shIds)
    const c = brt.corridorByKor.get(h.kor)
    const leg = halteLeg(h, c)
    const slot = halteByLeg.get(h.kor) ?? { a: [], b: [] }
    if (!slot[leg].includes(marker)) slot[leg].push(marker)
    halteByLeg.set(h.kor, slot)
  }
  applyFocus(true)
}

/** Re-paint corridors / halte / buses based on the current focus state.
 *
 *  No focus           → original API color, all visible.
 *  Corridor K focused → K stays at full opacity in its API color, with
 *                        slightly heavier polyline weight. Everything
 *                        else fades to ~10% so the focused route is
 *                        clearly the headliner. */
/** Which corridor should the map spotlight right now?
 *
 *  - Explicit corridor focus wins (user tapped a route).
 *  - Otherwise, if a bus is selected, spotlight that bus's corridor
 *    (TJ Transjakarta's bus detail behavior — dim everything else so
 *    the bus's path reads cleanly).
 *  - Else null = no spotlight, everything at default opacity. */
function spotlightKor(): string | null {
  if (focus.kor) return focus.kor
  if (selection.kind === 'bus' && selection.id) {
    const bus = brt.buses.get(selection.id)
    if (bus?.kor) return bus.kor
  }
  return null
}

/** Cache of the last spotlightKor we styled the markers for. When the
 *  spotlight hasn't changed, the corridor/halte sweep is a no-op — skip
 *  it and just refresh bus markers (which can have independently fresh
 *  fixes) + the selected-halte highlight. Callers that just rebuilt
 *  markers (drawCorridors / drawHalte) pass `force=true` so the new
 *  markers actually get their focus styling applied. */
let lastSpotlight: string | null = null
let lastSpotlightInit = false

function applyFocus(force = false) {
  const fk = spotlightKor()
  if (!force && lastSpotlightInit && fk === lastSpotlight) {
    for (const bus of brt.buses.values()) upsertBusMarker(bus)
    applySelectedHalte()
    return
  }
  lastSpotlight = fk
  lastSpotlightInit = true

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

  // Halte — opacity only changes with focus
  for (const [kor, byLeg] of halteByLeg.entries()) {
    const all = [...byLeg.a, ...byLeg.b]
    const opacity = fk === null || kor === fk ? 1 : 0.2
    for (const m of all) m.setStyle({ opacity, fillOpacity: opacity })
  }

  // Buses
  for (const bus of brt.buses.values()) upsertBusMarker(bus)

  // Selected halte highlight — re-apply after markers may have been
  // recreated by drawHalte.
  applySelectedHalte()
}

function busColorFor(b: BrtBus): string {
  return brt.colorForKor(b.kor) || '#0EA5E9'
}

/** Element opacity: full when no focus or on-focused-corridor, faded
 *  otherwise so the focused corridor's buses are the obvious read. */
function busOpacityFor(b: BrtBus): string {
  const fk = spotlightKor()
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

    // Selection toggles the spotlightKor — re-style corridors/halte to
    // dim everything that isn't on the selected bus's route (TJ-style).
    applyFocus()
    applySelectedHalte()
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

// Watch the set of per-leg keys, not the deep contents. The per-leg
// cache only grows (entries are added, never updated) so a fresh
// signature signals that a new leg landed and we need to redraw to
// pick up the new halte. A deep watcher would re-fire on irrelevant
// reactivity churn.
watch(
  () => [...brt.halteByLeg.keys()].sort().join('|'),
  () => {
    if (!map) return
    drawHalte(halte.value)
  },
)

watch(
  tripSelectedPlan,
  (plan, prev) => {
    if (!map) return
    // Snapshot the viewport on entering preview so we can restore it
    // when the user backs out — mirrors the bus/halte detail pattern.
    if (plan && !prev && !priorViewport) {
      priorViewport = { center: map.getCenter(), zoom: map.getZoom() }
    } else if (!plan && prev && priorViewport) {
      map.flyTo(priorViewport.center, priorViewport.zoom, { duration: 0.6 })
      priorViewport = null
    }
    drawTripPreview(plan ?? null)
  },
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
