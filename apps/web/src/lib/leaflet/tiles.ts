import L from 'leaflet'

const ATTR =
  '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/** CARTO Voyager — light, road-forward basemap. */
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

/** CARTO Dark Matter — clean dark basemap, used for dark mode. */
export function darkMatterTiles(): L.TileLayer {
  return L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
    {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: ATTR,
    },
  )
}
