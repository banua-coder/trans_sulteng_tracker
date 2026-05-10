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

export function halteMarker(latlng: L.LatLngExpression, color: string, opts?: L.CircleMarkerOptions) {
  return L.circleMarker(latlng, {
    radius: 6,
    color: '#fff',
    weight: 2,
    fillColor: color,
    fillOpacity: 1,
    className: 'halte-marker',
    ...opts,
  })
}
