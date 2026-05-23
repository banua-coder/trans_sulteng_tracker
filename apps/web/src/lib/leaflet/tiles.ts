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

/** ESRI World Imagery — free satellite/aerial tiles, no API key.
 *  Direct Google Maps tile URLs would violate Google's TOS, so we
 *  use ESRI's freely-available imagery service instead. */
export function satelliteTiles(): L.TileLayer {
  return L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution:
        'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    },
  )
}
