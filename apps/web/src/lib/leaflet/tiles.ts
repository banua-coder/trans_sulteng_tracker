import L from 'leaflet'

/** OpenFreeMap — genuinely free, no API key/signup/request limits,
 *  MIT-licensed, self-hostable. Replaces CARTO's raster basemaps,
 *  which now require an API key and watermark keyless requests.
 *  `positron`/`dark` are forked from the same OpenMapTiles style
 *  family CARTO's own Voyager/Dark Matter derive from, so the look
 *  stays close to what this app shipped with before. */
const OPENFREEMAP_ATTR =
  'OpenFreeMap &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

function openFreeMapTiles(style: 'positron' | 'dark'): L.MaplibreGL {
  return L.maplibreGL({
    style: `https://tiles.openfreemap.org/styles/${style}`,
    // The plugin always disables MapLibre's own built-in attribution
    // widget internally (regardless of this option) and instead reads
    // attributionControl.customAttribution to feed Leaflet's control
    // — this does not add a second, duplicate attribution UI.
    attributionControl: { customAttribution: OPENFREEMAP_ATTR },
  })
}

/** OpenFreeMap Positron — light, road-forward basemap. */
export function lightTiles(): L.MaplibreGL {
  return openFreeMapTiles('positron')
}

/** OpenFreeMap Dark — clean dark basemap, used for dark mode. */
export function darkTiles(): L.MaplibreGL {
  return openFreeMapTiles('dark')
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
