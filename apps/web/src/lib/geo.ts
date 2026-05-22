/**
 * Tiny geo helpers for the ride companion. Pure functions, no
 * reactivity — designed so the state-machine reducer and unit tests
 * can call them without spinning up Vue.
 */

export interface LatLng {
  lat: number
  lng: number
}

export interface PositionFix {
  lat: number
  lng: number
  /** epoch ms */
  ts: number
}

const EARTH_R_M = 6_371_000

/** Great-circle distance in metres between two lat/lng pairs. */
export function haversineM(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat)
  const φ2 = toRad(b.lat)
  const dφ = toRad(b.lat - a.lat)
  const dλ = toRad(b.lng - a.lng)
  const sinDφ = Math.sin(dφ / 2)
  const sinDλ = Math.sin(dλ / 2)
  const h = sinDφ * sinDφ + Math.cos(φ1) * Math.cos(φ2) * sinDλ * sinDλ
  return 2 * EARTH_R_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Average speed in km/h derived from a buffer of recent fixes. iOS
 *  Safari's GeolocationCoordinates.speed is null, so we compute it
 *  from sequential position deltas. Returns null when the buffer has
 *  fewer than 2 fixes or the time span is zero. */
export function speedKmh(buf: readonly PositionFix[]): number | null {
  if (buf.length < 2) return null
  let totalM = 0
  for (let i = 1; i < buf.length; i++) {
    totalM += haversineM(buf[i - 1], buf[i])
  }
  const spanMs = buf[buf.length - 1].ts - buf[0].ts
  if (spanMs <= 0) return null
  const mps = totalM / (spanMs / 1000)
  return mps * 3.6
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}
