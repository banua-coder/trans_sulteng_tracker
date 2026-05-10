/**
 * One-time Leaflet bootstrap. Side-effectful imports — keep at the
 * top of MapView.vue so the prototype patches (if any) load before
 * any map is instantiated.
 *
 * Bus heading rotation is handled in markers.ts via a CSS transform
 * on a sub-element — we no longer rely on leaflet-rotatedmarker so
 * the corridor code stays upright and readable.
 */
import 'leaflet'

export {}
