import L from 'leaflet'
import { badgeBg, onColor } from '@/lib/color'

/** Front-facing bus glyph, used on the bus-stop tile. */
function busGlyph(ink: string): string {
  return `<svg class="stop-glyph" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 11h16M8 21v-3M16 21v-3"/><circle cx="8.5" cy="14" r=".6" fill="${ink}"/><circle cx="15.5" cy="14" r=".6" fill="${ink}"/></svg>`
}

/**
 * Bus marker: a small circle in the route colour with the route code,
 * plus an arrow that rotates with the heading. Stale buses (>5 min
 * since the last fix) get a hatched gray treatment via `.stale`.
 * The rounded-square glyph tile is for bus stops, see stopTileMarker.
 */
export function busIcon(opts: {
  color: string
  code: string
  angle: number
  stale?: boolean
  /** Moving well off the corridor it is registered to. */
  offRoute?: boolean
}): L.DivIcon {
  const { color, code, angle, stale, offRoute } = opts
  const safe = code.replace(/[<>"']/g, '').slice(0, 4) || '·'
  const safeAngle = Number.isFinite(angle) ? angle : 0
  return L.divIcon({
    className: `bus-marker${stale ? ' stale' : ''}${offRoute ? ' off-route' : ''}`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -18],
    html: `
      <div class="bus-arrow-wrap" style="transform: rotate(${safeAngle}deg)">
        <span class="bus-arrow" style="border-bottom-color: ${color}"></span>
      </div>
      <div class="bus-disc" style="background:${badgeBg(color)};color:${onColor(badgeBg(color))}">${safe}</div>
    `,
  })
}

/** Bus-stop marker for a focused corridor: rounded-square tile in the
 *  route colour with a bus glyph. Clicks forward to the plain circle
 *  marker it replaces, so selection keeps working in one place. */
export function stopTileMarker(
  latlng: L.LatLngExpression,
  color: string,
  onClick: () => void,
): L.Marker {
  const m = L.marker(latlng, {
    icon: L.divIcon({
      className: 'stop-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      html: `<span style="background:${badgeBg(color)}">${busGlyph(onColor(badgeBg(color)))}</span>`,
    }),
    keyboard: false,
  })
  m.on('click', onClick)
  return m
}

/** Halte marker as a tiny CircleMarker on Leaflet's overlay pane.
 *  divIcon halte produce one absolutely-positioned DOM node per stop
 *  and have to be transformed individually on every pan — which
 *  visibly stutters with 50+ markers and the bus-shelter SVG's
 *  drop-shadow filter forcing compositing. CircleMarker draws on the
 *  shared overlay SVG and pans natively with the map. */
/** Default stop ring; the focused corridor recolours it to its own. */
export const HALTE_RING = '#64748b'

const HALTE_DOT_DEFAULTS: L.CircleMarkerOptions = {
  radius: 4.5,
  color: HALTE_RING,
  weight: 2.5,
  fillColor: '#ffffff',
  fillOpacity: 1,
  interactive: true,
}

export function halteMarker(
  latlng: L.LatLngExpression,
  opts?: L.CircleMarkerOptions,
): L.CircleMarker {
  return L.circleMarker(latlng, { ...HALTE_DOT_DEFAULTS, ...opts })
}

/** The focused stop: the bus-stop tile (same glyph as the stops of a
 *  focused corridor), larger and ringed, so a selected stop reads as
 *  a stop and not as a pulsing dot. It sits above buses parked at it. */
export function selectedStopMarker(latlng: L.LatLngExpression, color: string): L.Marker {
  return L.marker(latlng, {
    icon: L.divIcon({
      className: 'stop-marker stop-marker-focus',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      html: `<span style="background:${badgeBg(color)}">${busGlyph(onColor(badgeBg(color)))}</span>`,
    }),
    interactive: false,
    keyboard: false,
    zIndexOffset: 2000,
  })
}

/** Lettered terminal (A/B): solid route-colour disc, white border. */
export function terminalMarker(
  latlng: L.LatLngExpression,
  letter: string,
  color: string,
): L.Marker {
  const safe = letter.replace(/[<>"']/g, '').slice(0, 1)
  return L.marker(latlng, {
    icon: L.divIcon({
      className: 'terminal-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      html: `<span style="background:${badgeBg(color)};color:${onColor(badgeBg(color))}">${safe}</span>`,
    }),
    interactive: false,
    keyboard: false,
    zIndexOffset: 500,
  })
}
