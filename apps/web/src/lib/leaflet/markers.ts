import L from 'leaflet'

export function busIcon(opts: { color: string; code: string; stale?: boolean }): L.DivIcon {
  const { color, code, stale } = opts
  const safe = code.replace(/[<>"']/g, '').slice(0, 4) || '·'
  return L.divIcon({
    className: `bus-marker${stale ? ' stale' : ''}`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -18],
    html: `
      <div class="bus-disc" style="background:${color}">
        <span class="bus-heading" style="background:${color}"></span>
        ${safe}
      </div>`,
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
