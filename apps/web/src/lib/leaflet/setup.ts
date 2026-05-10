/**
 * One-time Leaflet bootstrap. Side-effectful imports — keep at the
 * top of MapView.vue so the prototype patches load before any map is
 * instantiated.
 */
import 'leaflet'
import 'leaflet-rotatedmarker'

export {}
