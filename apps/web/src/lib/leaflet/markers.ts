import L from 'leaflet'
import { onColor } from '@/lib/color'

/** White front-facing bus glyph, drawn inside the route-colour tile. */
function busGlyph(ink: string): string {
  return `<svg class="bus-glyph" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 11h16M8 21v-3M16 21v-3"/><circle cx="8.5" cy="14" r=".6" fill="${ink}"/><circle cx="15.5" cy="14" r=".6" fill="${ink}"/></svg>`
}

/**
 * Bus marker: rounded-square tile in the route colour with a white bus
 * glyph, a corner chip carrying the route code, and a heading arrow.
 *
 * Two stacked elements inside the divIcon:
 *   1. an arrow that rotates with the bus heading (transform: rotate(angle))
 *   2. a static disc with the corridor code (always upright + readable)
 *
 * Both pieces are tinted with the same corridor color so a quick glance
 * tells you the route. Stale buses (>5 min since last fix) get a hatched
 * gray treatment via the `.stale` class.
 */
export function busIcon(opts: {
  color: string
  code: string
  angle: number
  stale?: boolean
}): L.DivIcon {
  const { color, code, angle, stale } = opts
  const safe = code.replace(/[<>"']/g, '').slice(0, 4) || '·'
  const safeAngle = Number.isFinite(angle) ? angle : 0
  return L.divIcon({
    className: `bus-marker${stale ? ' stale' : ''}`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -22],
    html: `
      <div class="bus-arrow-wrap" style="transform: rotate(${safeAngle}deg)">
        <span class="bus-arrow" style="border-bottom-color: ${color}"></span>
      </div>
      <div class="bus-disc" style="background:${color};color:${onColor(color)}">${busGlyph(onColor(color))}<span class="bus-code" style="border-color:${color}">${safe}</span></div>
    `,
  })
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

/** Soft pulse ring placed on top of the currently selected halte.
 *  Lives in its own DOM marker so we get CSS animations + still keep
 *  the underlying dot lightweight. */
const _halteHaloHtml = '<span class="halte-halo-ring"></span>'
const _halteHaloIcon = L.divIcon({
  className: 'halte-halo',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  html: _halteHaloHtml,
})

export function halteHaloMarker(latlng: L.LatLngExpression): L.Marker {
  return L.marker(latlng, { icon: _halteHaloIcon, interactive: false, keyboard: false })
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
      html: `<span style="background:${color};color:${onColor(color)}">${safe}</span>`,
    }),
    interactive: false,
    keyboard: false,
    zIndexOffset: 500,
  })
}
