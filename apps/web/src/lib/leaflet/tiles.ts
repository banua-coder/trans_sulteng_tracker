import L from 'leaflet'

const ATTR =
  '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/** CARTO Voyager — light, road-forward basemap. Same family used in Banuacoder data dashboards. */
export function voyagerTiles(): L.TileLayer {
  return L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: ATTR,
    },
  )
}

/** Voyager dark — used when the app is in dark mode. */
export function voyagerDarkTiles(): L.TileLayer {
  return L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png',
    {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: ATTR,
    },
  )
}
