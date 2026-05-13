import L from 'leaflet'

/**
 * TransJakarta-style bus marker.
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
      <div class="bus-disc" style="background:${color}">${safe}</div>
    `,
  })
}

/** Halte marker as a tiny CircleMarker on Leaflet's overlay pane.
 *  divIcon halte produce one absolutely-positioned DOM node per stop
 *  and have to be transformed individually on every pan — which
 *  visibly stutters with 50+ markers and the bus-shelter SVG's
 *  drop-shadow filter forcing compositing. CircleMarker draws on the
 *  shared overlay SVG and pans natively with the map. */
const HALTE_DOT_DEFAULTS: L.CircleMarkerOptions = {
  radius: 5,
  color: '#ffffff',
  weight: 2,
  fillColor: '#94a3b8',
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
