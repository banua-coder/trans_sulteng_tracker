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

// Inline SVG bus-shelter icon — same shape as ic_marker_halte.png from
// the mitra darat APK but rendered natively; avoids PNG loading flicker
// and Leaflet's default white-box DivIcon styles.
const _halteIconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="22" viewBox="0 0 36 44" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));pointer-events:none">
  <rect x="1" y="1" width="34" height="34" rx="7" fill="#94a3b8"/>
  <path d="M14 34 L18 43 L22 34Z" fill="#94a3b8"/>
  <rect x="6" y="6" width="24" height="5" rx="2" fill="white"/>
  <rect x="8" y="12" width="7" height="10" rx="1" fill="white"/>
  <rect x="21" y="12" width="7" height="10" rx="1" fill="white"/>
  <rect x="8" y="23" width="3" height="5" rx="1" fill="white"/>
  <rect x="25" y="23" width="3" height="5" rx="1" fill="white"/>
</svg>`

const _halteIcon = L.divIcon({
  className: 'halte-icon',
  iconSize: [18, 22],
  iconAnchor: [9, 22],
  popupAnchor: [0, -24],
  html: _halteIconHtml,
})

export function halteMarker(latlng: L.LatLngExpression, opts?: L.MarkerOptions): L.Marker {
  return L.marker(latlng, { icon: _halteIcon, ...opts })
}
