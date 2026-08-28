/**
 * One-time Leaflet bootstrap. Side-effectful imports — keep at the
 * top of MapView.vue so the prototype patches (if any) load before
 * any map is instantiated.
 *
 * Bus heading rotation is handled in markers.ts via a CSS transform
 * on a sub-element — we no longer rely on leaflet-rotatedmarker so
 * the corridor code stays upright and readable.
 *
 * @maplibre/maplibre-gl-leaflet registers L.maplibreGL() onto the
 * Leaflet namespace as a side effect — needed by tiles.ts's vector
 * basemap layers.
 */
import 'leaflet'
import '@maplibre/maplibre-gl-leaflet'
import { setWorkerUrl } from 'maplibre-gl'

// maplibre-gl resolves its worker script from `import.meta.url` at
// runtime, relative to its own module file. Rollup renames/relocates
// chunks on build, which breaks that relative path — the worker
// silently fails to load and the map hangs forever with a blank
// canvas (no tiles, no console error). Dev serves maplibre-gl's real
// node_modules files directly (see optimizeDeps.exclude in
// vite.config.ts) so the relative path already resolves there; prod
// needs pointing at the two files vite.config.ts's maplibreWorkerAssets
// plugin emits verbatim, unhashed, at the dist root.
if (import.meta.env.PROD) {
  setWorkerUrl('/maplibre-gl-worker.mjs')
}

export {}
