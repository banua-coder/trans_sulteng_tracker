<script setup lang="ts">
import '@/lib/leaflet/setup'
import L from 'leaflet'
import polyline from '@mapbox/polyline'
import { isLightRoute } from '@/lib/color'
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'

import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { useFocusStore } from '@/stores/focus'
import { useGeoStore } from '@/stores/geo'
import { useSelectionStore } from '@/stores/selection'
import { useTripStore } from '@/stores/trip'
import { useUiStore } from '@/stores/ui'
import type { PlanResult } from '@/lib/tripPlanner'
import { busIcon, halteHaloMarker, halteMarker, HALTE_RING, stopTileMarker, terminalMarker } from '@/lib/leaflet/markers'
import { darkTiles, lightTiles, satelliteTiles } from '@/lib/leaflet/tiles'
import { useTheme } from '@/lib/theme'
import { haversineMeters, isStale } from '@/lib/format'
import { trackEvent } from '@/lib/analytics'
import type { BrtBus, BrtCorridor, BrtHalte } from '@/types/brt'

const brt = useBrtStore()
const city = useCityStore()
const selection = useSelectionStore()
const focus = useFocusStore()
const geo = useGeoStore()
const trip = useTripStore()
const ui = useUiStore()
const { t } = useI18n()
const { isDark } = useTheme()
const { corridors, halte, buses } = storeToRefs(brt)
const { tileMode } = storeToRefs(ui)
const {
  selectedPlan: tripSelectedPlan,
  origin: tripOrigin,
  destination: tripDestination,
  tapMode: tripTapMode,
  focusedStop: tripFocusedStop,
  planKors: tripPlanKors,
  planHalteNames: tripPlanHalteNames,
  planRideableBusIds: tripPlanRideableBuses,
} = storeToRefs(trip)

const containerEl = shallowRef<HTMLElement | null>(null)
let map: L.Map | null = null
let tileLayer: L.Layer | null = null
// White casing sits under the colour line so the selected route
// separates from the basemap (perjalananmu-style). Added to the map
// before corridorLayer so it always draws beneath.
const casingLayer = L.layerGroup()
const corridorLayer = L.layerGroup()
// Bus-stop tiles for the focused corridor. They sit over the plain
// circle markers, which are hidden while a tile covers them.
const stopTileLayer = L.layerGroup()
const tileOf = new Map<L.CircleMarker, L.Marker>()
// Lettered A/B terminals of the focused corridor leg.
const terminalLayer = L.layerGroup()
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
  /** performance.now() of the previous fix; sizes the glide. */
  lastFixAt: number
  raf?: number
}
const busMarkers = new Map<string, BusMarkerCache>()

const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Slide a bus to its new fix instead of teleporting. GPS fixes arrive
 *  every few seconds, so a straight setLatLng reads as hopping. The
 *  glide lasts about one fix interval (0.6 to 3 s) at constant speed,
 *  and restarts from wherever the marker currently is. Big jumps, a
 *  hidden tab and reduced motion snap instead. */
function glideTo(cache: BusMarkerCache, to: L.LatLngTuple) {
  const m = cache.marker
  if (cache.raf) cancelAnimationFrame(cache.raf)
  cache.raf = undefined
  const from = m.getLatLng()
  const dist = from.distanceTo(L.latLng(to))
  const now = performance.now()
  const gap = now - cache.lastFixAt
  cache.lastFixAt = now
  if (REDUCED_MOTION || document.hidden || dist < 1 || dist > 400) {
    m.setLatLng(to)
    return
  }
  const dur = Math.min(Math.max(gap, 600), 3000)
  const step = (t: number) => {
    const k = Math.min(1, (t - now) / dur)
    m.setLatLng([from.lat + (to[0] - from.lat) * k, from.lng + (to[1] - from.lng) * k])
    cache.raf = k < 1 ? requestAnimationFrame(step) : undefined
  }
  cache.raf = requestAnimationFrame(step)
}

function dropBusMarker(key: string) {
  const c = busMarkers.get(key)
  if (c?.raf) cancelAnimationFrame(c.raf)
  busMarkers.delete(key)
}
const lastReceivedAt = new Map<string, number>()

/** Polylines and halte tracked per (kor, leg) so the A↔B toggle can fit
 *  the map to one leg even though styling stays per-corridor. */
type Leg = 'a' | 'b'
const corridorLines = new Map<string, Record<Leg, L.Polyline[]>>()
const casingOf = new WeakMap<L.Polyline, L.Polyline>()

/** Style a corridor line and its casing together. The casing only
 *  shows on emphasised (weight >= 6) lines. */
function styleLine(ln: L.Polyline, color: string, opacity: number, weight: number) {
  ln.setStyle({ color, opacity, weight })
  casingOf.get(ln)?.setStyle({
    // White casing vanishes against pale routes (yellow, sky blue), so
    // those get a dark one.
    color: isLightRoute(color) ? '#0a0e14' : '#fff',
    weight: weight + 3,
    opacity: weight >= 6 ? 0.9 : 0,
  })
}
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

function renderStopTiles(fk: string | null, hide: boolean) {
  stopTileLayer.clearLayers()
  tileOf.clear()
  if (!fk || hide) return
  const slot = halteByLeg.get(fk)
  if (!slot) return
  const color = brt.corridorByKor.get(fk)?.color || '#0EA5E9'
  for (const m of new Set([...slot.a, ...slot.b])) {
    if ((m.options.opacity ?? 1) <= 0) continue
    const tile = stopTileMarker(m.getLatLng(), color, () => m.fire('click'))
    const name = m.getTooltip()?.getContent()
    if (name) tile.bindTooltip(name as string, { direction: 'top', offset: [0, -10] })
    tile.addTo(stopTileLayer)
    tileOf.set(m, tile)
    m.setStyle({ opacity: 0, fillOpacity: 0 })
  }
}

function markSelectedTile() {
  for (const t of tileOf.values()) t.getElement()?.classList.remove('selected')
  if (selectedHalteMarker) tileOf.get(selectedHalteMarker)?.getElement()?.classList.add('selected')
}

function applySelectedHalte() {
  applySelectedHalteInner()
  markSelectedTile()
}

function applySelectedHalteInner() {
  if (selectedHalteMarker) {
    selectedHalteMarker.setStyle({ radius: 4.5, fillColor: '#fff', color: HALTE_RING, weight: 2.5 })
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
  marker.setStyle({ radius: 8, fillColor: '#1D9CD4', color: '#fff', weight: 2.5 })
  marker.bringToFront()
  selectedHalteMarker = marker
  if (map) {
    selectedHalteHalo = halteHaloMarker([lat, lng]).addTo(map)
    // Bus markers go up to z-index 1500 when selected. Push the halte
    // halo above them so the focused stop is never hidden by a bus
    // parked at it.
    selectedHalteHalo.setZIndexOffset(2000)
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
/** When true, a flyTo (the initial zoom-in on bus/halte selection) is
 *  still animating. Follow-panTo calls suppress themselves while this
 *  is set so they don't cancel the in-progress zoom. */
let flyInProgress = false
function markFlyInProgress(ms = 700) {
  flyInProgress = true
  setTimeout(() => { flyInProgress = false }, ms)
}

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
  tileLayer = currentTiles().addTo(map)

  casingLayer.addTo(map)
  corridorLayer.addTo(map)
  terminalLayer.addTo(map)
  stopTileLayer.addTo(map)
  halteLayer.addTo(map)
  busLayer.addTo(map)
  meLayer.addTo(map)
  tripPreviewLayer.addTo(map)

  // Only USER gestures break the follow lock — programmatic flyTo /
  // panTo (which we use to glide the map with the selected bus) also
  // fire dragstart/zoomstart, so without the originalEvent check the
  // very flyTo that starts the follow would immediately kill it.
  map.on('dragstart zoomstart', (e: L.LeafletEvent) => {
    if ((e as L.LeafletEvent & { originalEvent?: Event }).originalEvent) {
      following = false
    }
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
  casingLayer.clearLayers()
  stopTileLayer.clearLayers()
  tileOf.clear()
  terminalLayer.clearLayers()
  stopTileLayer.clearLayers()
  tileOf.clear()
  corridorLayer.clearLayers()
  halteLayer.clearLayers()
  busLayer.clearLayers()
  for (const c of busMarkers.values()) if (c.raf) cancelAnimationFrame(c.raf)
  busMarkers.clear()
  corridorLines.clear()
  halteByLeg.clear()
  halteSeen.clear()
  halteMarkerKors.clear()
  tripPreviewLayer.clearLayers()
}

/** Slice a corridor polyline between two halte coordinates. Returns
 *  the LatLngTuple sub-array running through every vertex the bus
 *  actually drives over between the boarding and alighting halte —
 *  not just a straight line between the two halte coords.
 *
 *  Tries both legs (points_a, points_b) and picks whichever yields
 *  a forward (i.e. boarding-index < alighting-index) slice with the
 *  smaller total snap distance. */
function corridorSlice(
  kor: string,
  fromCoord: L.LatLngTuple,
  toCoord: L.LatLngTuple,
): L.LatLngTuple[] | null {
  const c = brt.planCorridorByKor.get(kor)
  if (!c) return null

  function trySlice(enc: string | undefined | null): { slice: L.LatLngTuple[]; snap: number } | null {
    if (!enc) return null
    let pts: L.LatLngTuple[]
    try { pts = polyline.decode(enc) as L.LatLngTuple[] } catch { return null }
    if (pts.length < 2) return null
    let fromIdx = 0
    let fromDist = Infinity
    let toIdx = 0
    let toDist = Infinity
    for (let i = 0; i < pts.length; i++) {
      const p = { lat: pts[i][0], lng: pts[i][1] }
      const df = haversineMeters({ lat: fromCoord[0], lng: fromCoord[1] }, p)
      const dt = haversineMeters({ lat: toCoord[0], lng: toCoord[1] }, p)
      if (df < fromDist) { fromDist = df; fromIdx = i }
      if (dt < toDist) { toDist = dt; toIdx = i }
    }
    if (fromIdx >= toIdx) return null
    return { slice: pts.slice(fromIdx, toIdx + 1), snap: fromDist + toDist }
  }

  const a = trySlice(c.points_a)
  const b = trySlice(c.points_b)
  if (!a && !b) return null
  if (a && !b) return a.slice
  if (!a && b) return b.slice
  return a!.snap <= b!.snap ? a!.slice : b!.slice
}

/** Draw a saved Plan onto the map:
 *
 *   - Origin pin (cyan disc).
 *   - Destination pin (red disc).
 *   - For each ride step: a thick segment of the corresponding
 *     corridor polyline, sliced from boarding halte to alighting
 *     halte. Uses the corridor's real geometry (points_a/points_b),
 *     not straight chords between halte.
 *   - For each walk step: dashed gray line directly between
 *     endpoints (walking has no corridor geometry).
 *   - Numbered red discs at each boarding/alighting halte. Transfers
 *     share a single disc.
 *
 *  Fits the map viewport to the plan bounds. */
function drawTripPreview(plan: PlanResult | null) {
  tripPreviewLayer.clearLayers()
  if (!plan || !map) return

  const bounds = L.latLngBounds([])
  const originPt = tripOrigin.value?.point
  const destPt = tripDestination.value?.point

  if (originPt) {
    bounds.extend([originPt.lat, originPt.lng])
    terminalMarker([originPt.lat, originPt.lng], 'A', '#1D9CD4').addTo(tripPreviewLayer)
  }
  if (destPt) {
    bounds.extend([destPt.lat, destPt.lng])
    terminalMarker([destPt.lat, destPt.lng], 'B', '#dc2626').addTo(tripPreviewLayer)
  }

  function halteCoordByName(name: string, kor: string | undefined): L.LatLngTuple | null {
    const h = (kor && brt.planHalte.find((x) => x.sh_name === name && x.kor === kor))
      ?? brt.planHalte.find((x) => x.sh_name === name)
    if (!h) return null
    const lat = parseFloat(h.sh_lat)
    const lng = parseFloat(h.sh_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return [lat, lng]
  }

  let lastEndpoint: L.LatLngTuple | null = originPt ? [originPt.lat, originPt.lng] : null

  for (const step of plan.steps) {
    if (step.kind === 'ride' && step.kor) {
      const from = halteCoordByName(step.fromName, step.kor)
      const to = halteCoordByName(step.toName, step.kor)
      if (from && to) {
        const slice = corridorSlice(step.kor, from, to)
        const path = slice ?? [from, to]
        for (const p of path) bounds.extend(p)
        const color = brt.colorForKor(step.kor) || '#1D9CD4'
        L.polyline(path, {
          color: '#fff',
          weight: 10,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(tripPreviewLayer)
        L.polyline(path, {
          color,
          weight: 7,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(tripPreviewLayer)
        lastEndpoint = to
      }
    } else if (step.kind === 'walk') {
      // Best-effort: connect the last known endpoint to the next
      // halte (if the step's toName matches one) or to the
      // destination pin. Dashed line so it reads as walking.
      const to = step.toName === 'Tujuan'
        ? (destPt ? [destPt.lat, destPt.lng] as L.LatLngTuple : null)
        : halteCoordByName(step.toName, undefined)
      if (lastEndpoint && to) {
        bounds.extend(to)
        L.polyline([lastEndpoint, to], {
          color: '#6b7280',
          weight: 4,
          opacity: 0.7,
          dashArray: '6 6',
          lineCap: 'round',
        }).addTo(tripPreviewLayer)
        lastEndpoint = to
      }
    }
  }

  // Numbered markers at each boarding / alighting halte.
  const seen = new Set<string>()
  let counter = 1
  function placeMarker(name: string, kor: string | undefined) {
    if (seen.has(name)) return
    seen.add(name)
    const c = halteCoordByName(name, kor)
    if (!c) return
    bounds.extend(c)
    L.marker(c, {
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

  for (const step of plan.steps) {
    if (step.kind !== 'ride') continue
    placeMarker(step.fromName, step.kor)
    placeMarker(step.toName, step.kor)
  }

  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.2), { duration: 0.6, animate: true })
  }
}

/** A/B terminals at the start and end of the focused leg line(s). */
function addTerminals(lines: L.Polyline[], color: string) {
  if (!lines.length) return
  const first = (lines[0].getLatLngs() as L.LatLng[])[0]
  const lastLn = lines[lines.length - 1].getLatLngs() as L.LatLng[]
  const last = lastLn[lastLn.length - 1]
  if (first) terminalMarker(first, 'A', color).addTo(terminalLayer)
  if (last) terminalMarker(last, 'B', color).addTo(terminalLayer)
}

function drawCorridors(items: BrtCorridor[]) {
  casingLayer.clearLayers()
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
          weight: 3,
          opacity: dim ? 0.35 : 0.7,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: true,
        })
        const casing = L.polyline(latlngs, {
          color: '#fff',
          weight: 6,
          opacity: 0,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
        }).addTo(casingLayer)
        casingOf.set(line, casing)
        line.on('click', () => {
        // When a different corridor is already focused, ignore clicks
        // on other corridors' (dimmed) polylines — the user explicitly
        // narrowed to one route. They can click the back button on the
        // panel to clear focus and then pick a new corridor.
        if (focus.kor && focus.kor !== c.kor) return
        focus.focus(c.kor)
      })
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
      const newMarker = halteMarker([lat, lng])
        .bindTooltip(h.sh_name, { direction: 'top', offset: [0, -6] })
      newMarker.on('click', () => {
        // When a corridor is focused, only halte on that corridor's
        // active leg are interactive. The marker may be shared across
        // kors via coord dedup, so we check the active-leg sh_id set
        // (the same one applyFocus uses for visibility) and pick the
        // matching sh_id from this marker's id list.
        if (focus.kor) {
          const active = activeLegHalteShIds()
          const shIds = halteMarkerShIds.get(newMarker)
          if (!active || !shIds) return
          let pickId: string | null = null
          for (const id of shIds) {
            if (active.has(id)) { pickId = id; break }
          }
          if (!pickId) return
          selection.selectHalte(pickId)
          return
        }
        selection.selectHalte(h.sh_id)
      })
      newMarker.addTo(halteLayer)
      halteSeen.set(coordKey, newMarker)
      marker = newMarker
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

/** sh_ids of the active-leg halte for the focused corridor. Used to
 *  decide per-marker visibility (markers may be shared across kors via
 *  coordinate dedup, so byLeg slot alone isn't authoritative) and to
 *  gate halte clicks when corridor focus is active. Returns null when
 *  no corridor is focused or no direction is active. */
/** The corridor leg the map should show: the selected bus's own
 *  direction when a bus is selected (only its route, not the reverse),
 *  otherwise the focused corridor's chosen direction. */
function legTarget(): { kor: string; leg: 'a' | 'b' } | null {
  if (selection.kind === 'bus' && selection.id) {
    const b = brt.buses.get(selection.id)
    const c = b?.kor ? brt.corridorByKor.get(b.kor) : undefined
    if (b && c) return { kor: b.kor, leg: b.toward === c.toward ? 'a' : 'b' }
  }
  if (focus.kor) return { kor: focus.kor, leg: focus.direction }
  return null
}

function activeLegHalteShIds(): Set<string> | null {
  const lt = legTarget()
  if (!lt) return null
  const c = brt.corridorByKor.get(lt.kor)
  if (!c) return null
  const wantToward = lt.leg === 'a' ? c.toward : c.origin
  const wantOrigin = lt.leg === 'a' ? c.origin : c.toward
  const leg = brt.getHalteForLeg(lt.kor, wantToward, wantOrigin)
  if (!leg.length) {
    // Stops for this leg are not loaded yet; fetch, then redraw.
    void brt.ensureHalteForLeg(lt.kor, wantToward, wantOrigin).then(() => applyFocus(true)).catch(() => {})
    return null
  }
  return new Set(leg.map((h) => h.sh_id))
}

function applyFocus(force = false) {
  const fk = spotlightKor()
  // Active leg when a corridor is explicitly focused via focus.kor —
  // 'a' = origin→toward, 'b' = toward→origin. Used to hide the other
  // leg's polyline + halte markers so the map matches what the
  // corridor detail panel shows in its direction tab. When the
  // spotlight comes from a bus selection (spotlightKor fallback)
  // rather than focus.kor, we still want both legs visible — the
  // user is inspecting a single vehicle, not a direction.
  const lt = legTarget()
  const activeLeg: 'a' | 'b' | null = fk && lt && lt.kor === fk ? lt.leg : null
  const activeShIds = activeLeg ? activeLegHalteShIds() : null
  const planKors = tripPlanKors.value
  const planNames = planKors ? tripPlanHalteNames.value : null
  // Cache key includes trip-plan kor set + the active leg so the
  // memoized fast-path reacts to direction toggles.
  const cacheKey = planKors
    ? `plan:${[...planKors].sort().join(',')}`
    : `sk:${fk ?? ''}:${activeLeg ?? ''}`
  if (!force && lastSpotlightInit && cacheKey === lastSpotlight) {
    for (const bus of brt.buses.values()) upsertBusMarker(bus)
    applySelectedHalte()
    return
  }
  lastSpotlight = cacheKey
  lastSpotlightInit = true

  // Corridors
  terminalLayer.clearLayers()
  for (const [kor, byLeg] of corridorLines.entries()) {
    const c = brt.corridorByKor.get(kor)
    const baseColor = c?.color || '#0EA5E9'
    const baseDim = c && Number(c.is_ops) !== 1
    const all = [...byLeg.a, ...byLeg.b]

    if (planKors) {
      // Trip plan active — every corridor (including the plan's own)
      // is hidden because drawTripPreview already paints the exact
      // sliced segments the user actually rides through. Showing the
      // full corridor lines would re-add the off-route portions.
      for (const ln of all) styleLine(ln, baseColor, 0, 0)
    } else if (fk === null) {
      const opacity = baseDim ? 0.35 : 0.7
      for (const ln of all) styleLine(ln, baseColor, opacity, 3)
    } else if (kor === fk) {
      if (activeLeg) {
        const active = activeLeg === 'a' ? byLeg.a : byLeg.b
        const inactive = activeLeg === 'a' ? byLeg.b : byLeg.a
        for (const ln of active) styleLine(ln, baseColor, 1, 6.5)
        for (const ln of inactive) styleLine(ln, baseColor, 0, 0)
        addTerminals(active, baseColor)
      } else {
        for (const ln of all) styleLine(ln, baseColor, 1, 6.5)
        addTerminals(all, baseColor)
      }
    } else {
      // Dimmed, not hidden: a first-time rider who hasn't picked a
      // corridor yet should still register that other routes exist.
      // 0.35 matches the existing "de-emphasized but visible" level
      // used above for off-hours corridors (baseDim) — same visual
      // language, not a new one. Previously 0.1, which read as
      // near-invisible to anyone who wasn't already a TJ power user.
      for (const ln of all) styleLine(ln, baseColor, 0.45, 2.5)
    }
  }

  // Halte — when trip plan active, only halte on the actual path
  // (by sh_name) stay visible; everything else collapses to opacity
  // 0 so the trip view shows just the stops we'll pass through.
  for (const [kor, byLeg] of halteByLeg.entries()) {
    const all = [...byLeg.a, ...byLeg.b]
    if (planKors && planNames) {
      for (const m of all) {
        const shIds = halteMarkerShIds.get(m)
        let onPath = false
        if (shIds) {
          for (const id of shIds) {
            const h = brt.halte.find((x) => x.sh_id === id)
            if (h && planNames.has(h.sh_name)) { onPath = true; break }
          }
        }
        const op = onPath ? 1 : 0
        m.setStyle({ opacity: op, fillOpacity: op })
      }
      continue
    }
    // Same softened dim as the corridor lines above (see comment
    // there) — kept in sync so lines and their halte read as one
    // de-emphasized group rather than two different intensities.
    const opacity = fk === null || kor === fk ? 1 : 0.35
    const ring = fk !== null && kor === fk ? (brt.corridorByKor.get(kor)?.color || HALTE_RING) : HALTE_RING
    for (const m of all) m.setStyle({ color: ring, opacity, fillOpacity: opacity })
  }

  // Direction filter: override the above per-marker. We iterate the
  // deduped halteSeen map (each physical stop visited once) and check
  // its sh_id set against the active leg's authoritative halte list.
  // This is necessary because coordinate-dedup makes byLeg slots
  // unreliable — a transfer stop's marker lives in whichever
  // corridor's slot was populated first, and per-leg-fetched halte
  // can land in the wrong slot when their origin/toward fields are
  // ambiguous (K2A reverse, K1 terminus).
  if (activeShIds) {
    for (const m of halteSeen.values()) {
      const shIds = halteMarkerShIds.get(m)
      let onActive = false
      if (shIds) {
        for (const id of shIds) {
          if (activeShIds.has(id)) { onActive = true; break }
        }
      }
      const op = onActive ? 1 : 0
      m.setStyle({ opacity: op, fillOpacity: op })
    }
  }

  // Bus-selected refinement: dim stops the bus has already passed so
  // the user can scan only what's still ahead (TJ-style "upcoming
  // halte" view, beads c1d).
  applyUpcomingHalteFilter(activeShIds)
  renderStopTiles(fk, !!planKors)

  // Buses
  for (const bus of brt.buses.values()) upsertBusMarker(bus)

  // Selected halte highlight — re-apply after markers may have been
  // recreated by drawHalte.
  applySelectedHalte()
}

function busColorFor(b: BrtBus): string {
  return brt.colorForKor(b.kor) || '#0EA5E9'
}

/** When a bus is selected, keep every halte on its leg at full opacity
 *  — both the upcoming stops and the ones already passed. The user
 *  wanted to see the whole route clearly; dimming the passed half made
 *  shared-coordinate halte (multi-corridor stops) appear half-erased,
 *  which read worse than it solved. */
function applyUpcomingHalteFilter(activeShIds: Set<string> | null) {
  if (selection.kind !== 'bus' || !selection.id) return
  const bus = brt.buses.get(selection.id)
  if (!bus?.kor) return
  const slot = halteByLeg.get(bus.kor)
  if (!slot) return
  for (const m of [...slot.a, ...slot.b]) {
    // Keep the leg filter: stops of the reverse direction stay hidden.
    if (activeShIds) {
      const ids = halteMarkerShIds.get(m)
      let on = false
      if (ids) for (const id of ids) if (activeShIds.has(id)) { on = true; break }
      if (!on) continue
    }
    m.setStyle({ opacity: 1, fillOpacity: 1 })
  }
}

/** Element opacity: full when no focus or on-focused-corridor, faded
 *  otherwise so the focused corridor's buses are the obvious read.
 *  When a trip plan is active, only buses the user can actually
 *  catch for the plan stay visible — the rest fade hard so they
 *  don't distract. */
function busOpacityFor(b: BrtBus): string {
  const rideable = tripPlanRideableBuses.value
  if (rideable != null) {
    // Trip-plan mode: show only buses on a plan ride's corridor
    // heading toward the boarding halte the user will catch.
    return rideable.has(b.imei || b.id) ? '1' : '0'
  }
  const fk = spotlightKor()
  if (fk === null) return '1'
  // Other corridors hide completely when a route is focused — the
  // user explicitly narrowed to one corridor, so foreign buses are
  // pure noise on the map. (Previous behavior: dim to 0.18.)
  if (b.kor !== fk) return '0'
  // Same kor as focused corridor — opposite-direction buses on the
  // focused route stay visible but transparent so the user can still
  // see the full fleet on the corridor while their active direction
  // reads cleanly. Active = toward matches OR upstream-reported next
  // stop is on the active leg (mirrors corridorTimelineRowsFor).
  if (focus.kor === fk) {
    const c = brt.corridorByKor.get(fk)
    if (c) {
      const wantToward = focus.direction === 'a' ? c.toward : c.origin
      if (b.toward !== wantToward) {
        const active = activeLegHalteShIds()
        if (!active || !b.new_shel_t || !active.has(b.new_shel_t)) return '0.25'
      }
    }
  }
  return '1'
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
    marker.on('click', () => {
      // When a corridor is focused, only block clicks on buses from
      // other corridors (those markers are hidden anyway). Same-
      // corridor opposite-direction buses are rendered transparent
      // so the user can inspect them — let those clicks through.
      // Look up the live bus from the store rather than the
      // captured-at-creation `b` whose kor could be stale.
      if (focus.kor) {
        const liveBus = brt.buses.get(key) ?? b
        if (liveBus.kor !== focus.kor) return
      }
      focusBus(key, b)
    })
    marker.addTo(busLayer)
    cache = { marker, iconKey, lastFixAt: performance.now() }
    busMarkers.set(key, cache)
  } else {
    glideTo(cache, [b.lat, b.lng])
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
  const isSelectedBus = selection.kind === 'bus' && selection.id === key
  if (isSelectedBus) z = 1500
  m.setZIndexOffset(z)

  // Toggle the .selected modifier on the bus marker's element so the
  // CSS halo only shows on the bus the user actually picked — fixes
  // the "two same-color buses nearby, which one am I following?"
  // confusion.
  const markerEl = m.getElement()
  if (markerEl) {
    if (isSelectedBus) markerEl.classList.add('selected')
    else markerEl.classList.remove('selected')
  }

  // If this is the bus the user is following, glide the map with it.
  // Skip while the initial flyTo zoom-in is still animating — a panTo
  // would cancel the zoom and leave us at the intermediate zoom level.
  if (
    following &&
    !flyInProgress &&
    selection.kind === 'bus' &&
    selection.id === key &&
    map
  ) {
    map.panTo([b.lat, b.lng], { animate: true, duration: 0.6 })
  }
}

function focusBus(key: string, _b: BrtBus) {
  // Toggle: clicking the focused bus again pops the bus level off the
  // selection stack — drops back to whatever was visible before.
  if (selection.kind === 'bus' && selection.id === key) {
    selection.back()
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
      dropBusMarker(key)
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
/** Pick the tile layer that matches the current basemap mode and
 *  theme. Satellite mode ignores dark mode (ESRI doesn't offer a
 *  dark variant); the OpenFreeMap vector basemap swaps between its
 *  light and dark styles. */
function currentTiles(): L.Layer {
  if (tileMode.value === 'satellite') return satelliteTiles()
  return isDark.value ? darkTiles() : lightTiles()
}

watch([isDark, tileMode], () => {
  if (!map) return
  if (tileLayer) tileLayer.remove()
  tileLayer = currentTiles().addTo(map)
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
      // Fit to the active leg only when a direction is selected, so
      // the camera follows the polyline the user is actually viewing.
      const legLines = byLeg
        ? (dir === 'a' ? byLeg.a : dir === 'b' ? byLeg.b : [...byLeg.a, ...byLeg.b])
        : []
      if (legLines.length) {
        const bounds = L.latLngBounds([])
        for (const ln of legLines) bounds.extend(ln.getBounds())
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
        markFlyInProgress()
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
          markFlyInProgress()
          map.flyTo([hLat as number, hLng as number], targetZoom, { duration: 0.6 })
        }
      }
    } else {
      following = false
      if (wasModal && priorViewport && map) {
        markFlyInProgress()
        map.flyTo(priorViewport.center, priorViewport.zoom, { duration: 0.6 })
        priorViewport = null
      }
    }

    // Selection toggles the spotlightKor + the upcoming-halte filter.
    // force=true bypasses the memoization so the filter actually
    // re-applies when bus selection changes within the same kor.
    applyFocus(true)
    applySelectedHalte()
  },
)

// As the selected bus advances along its leg, refresh the
// upcoming-halte fade so previously-passed stops dim and the bus's
// next stop stays bright.
watch(
  () => {
    if (selection.kind !== 'bus' || !selection.id) return null
    return brt.buses.get(selection.id)?.new_shel_t ?? null
  },
  (next, prev) => {
    if (next === prev) return
    applyUpcomingHalteFilter(legTarget() ? activeLegHalteShIds() : null)
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

// User tapping a step row in TripDetailPanel sets a focused-stop
// point; pan + zoom to it. Clear immediately so the same point can
// be re-tapped to re-zoom.
watch(tripFocusedStop, (p) => {
  if (!p || !map) return
  map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 17), { duration: 0.5 })
  trip.focusStop(null)
})

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
    // Plan selection changes which corridors should stay visible —
    // re-apply focus so the dimming/highlighting refreshes.
    applyFocus(true)
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
  // `deep: true` is needed because the store's Map is shallowReactive —
  // Vue's watch on a Map ref without deep doesn't fire on `.set()`.
  // The walk is cheap now (only Map entries, not nested object props)
  // since the values are no longer Proxy-wrapped.
  // `flush: 'post'` batches marker DOM writes with the render commit
  // phase so Leaflet's per-marker style mutations don't interleave
  // with Vue's own DOM updates.
  { deep: true, flush: 'post' },
)

/** Trip planner tap-on-map mode: while tripTapMode is non-null, the
 *  next map click is intercepted and snapped to the nearest halte
 *  (the user's tap is rarely on a halte pixel-exactly anyway, and
 *  transit planning needs a halte node to route from/to). */
let tapClickHandler: ((e: L.LeafletMouseEvent) => void) | null = null

function detachTapHandler() {
  if (map && tapClickHandler) map.off('click', tapClickHandler)
  tapClickHandler = null
}

watch(tripTapMode, (mode) => {
  detachTapHandler()
  if (!mode || !map) return
  tapClickHandler = (ev: L.LeafletMouseEvent) => {
    const h = brt.nearestHalte(ev.latlng.lat, ev.latlng.lng)
    if (!h) {
      // No halte loaded at all — fall back to a free pin so the user
      // at least sees their tap registered.
      const endpoint = { kind: 'pin' as const, label: t('trip.pinLabel'), point: { lat: ev.latlng.lat, lng: ev.latlng.lng }, sh_id: null }
      if (mode === 'origin') trip.setOrigin(endpoint)
      else trip.setDestination(endpoint)
      trip.setTapMode(null)
      return
    }
    const endpoint = {
      kind: 'halte' as const,
      label: h.sh_name,
      point: { lat: parseFloat(h.sh_lat), lng: parseFloat(h.sh_lng) },
      sh_id: h.sh_id,
    }
    if (mode === 'origin') trip.setOrigin(endpoint)
    else trip.setDestination(endpoint)
    trip.setTapMode(null)
  }
  map.on('click', tapClickHandler)
}, { immediate: false })

// ESC to cancel tap mode.
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && tripTapMode.value) {
    trip.setTapMode(null)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  if (staleTicker) window.clearInterval(staleTicker)
  staleTicker = undefined
  if (resizeFrame != null) cancelAnimationFrame(resizeFrame)
  resizeObserver?.disconnect()
  resizeObserver = undefined
  window.removeEventListener('keydown', onKeyDown)
  detachTapHandler()
  clearAll()
  tileLayer?.remove()
  map?.remove()
  map = null
  tileLayer = null
})
</script>

<template>
  <div :class="['relative h-full w-full', tripTapMode ? 'map-tap-mode' : '']">
    <div
      ref="containerEl"
      class="h-full w-full"
      aria-label="Peta lokasi bus"
      role="region"
    />
    <!-- Tap-on-map mode banner. Top-center, non-interactive so it
         doesn't swallow clicks meant for the map underneath. -->
    <div
      v-if="tripTapMode"
      class="pointer-events-none absolute left-1/2 top-3 z-[900] -translate-x-1/2 rounded-full bg-bnc-ink/85 px-4 py-2 text-xs text-bnc-paper shadow-[var(--shadow-elevated)] backdrop-blur"
      role="status"
    >
      <span class="font-mono uppercase tracking-wider">
        {{ tripTapMode === 'origin' ? $t('trip.tapPrompt') : $t('trip.tapPrompt') }}
      </span>
      <span class="ml-2 font-mono text-[10px] text-bnc-stone-400">
        {{ $t('trip.tapPromptCancel') }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.map-tap-mode :deep(.leaflet-container) {
  cursor: crosshair !important;
}
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
