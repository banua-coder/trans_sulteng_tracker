/** Time + speed + distance formatters used across the UI. */

import type { BrtBus } from '@/types/brt'

/** Parse the upstream `dt_tracker` / `dt_server` strings.
 *
 *  The findings note these are UTC, but the wire format is
 *  "YYYY-MM-DD HH:MM:SS" with no timezone marker. `Date.parse` would
 *  treat that as LOCAL time, so a bus reported "now" in WITA (UTC+8)
 *  would show up 8 hours in the past. We append " UTC" if no zone
 *  hint is present so the parse is correct. */
export function parseUpstreamTime(s?: string | null): number | null {
  if (!s) return null
  const trimmed = s.trim()
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(trimmed)
  const normalized = trimmed.includes('T')
    ? trimmed + (hasZone ? '' : 'Z')
    : trimmed.replace(' ', 'T') + (hasZone ? '' : 'Z')
  const t = Date.parse(normalized)
  return Number.isNaN(t) ? null : t
}

export function ageSeconds(iso?: string | null): number | null {
  const t = parseUpstreamTime(iso)
  if (t == null) return null
  return Math.max(0, Math.floor((Date.now() - t) / 1000))
}

export function formatAge(secs: number | null): string {
  if (secs == null) return '—'
  if (secs < 60) return `${secs}d`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  return `${Math.floor(secs / 3600)}j`
}

export function formatSpeed(kmh?: number | null): string {
  if (kmh == null) return '—'
  return `${Math.round(kmh)}`
}

export function formatDistance(meters?: string | number | null): string {
  if (meters == null || meters === '') return '—'
  const m = typeof meters === 'string' ? parseFloat(meters) : meters
  if (Number.isNaN(m)) return '—'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}

/** ETA in minutes from a distance (meters) and speed (km/h). null if speed=0 or unknown. */
export function etaMinutes(distMeters?: string | null, speedKmh?: number | null): number | null {
  if (!distMeters || speedKmh == null || speedKmh <= 0) return null
  const m = parseFloat(distMeters)
  if (Number.isNaN(m)) return null
  return m / 1000 / speedKmh * 60
}

/** True when a bus has stopped delivering useful state.
 *
 *  Three independent signals — any one flips the bus to stale:
 *   1. **Data drought** — no upsert from the server for
 *      `feedTimeoutSecs` (default 5 min). The feed is dead.
 *   2. **Sustained zero speed** — speed has been reported as exactly
 *      0 km/h for `zeroSpeedSecs` (default 60 s). The driver has
 *      stopped pinging at the wheel.
 *   3. **Stalled in place** — speed < `stallSpeedKmh` AND the
 *      position hasn't moved beyond GPS jitter for `stallSecs`
 *      (default 90 s). Parked / engine off.
 *
 *  A bus moving > 0 km/h with fresh fixes never trips the test. */
export function isStale(
  b: BrtBus,
  feedTimeoutSecs = 5 * 60,
  stallSpeedKmh = 20,
  stallSecs = 90,
  zeroSpeedSecs = 60,
): boolean {
  const now = Date.now()

  // 1. Data drought
  const recv = b._receivedAt
  if (recv && now - recv > feedTimeoutSecs * 1000) return true
  if (!recv) {
    const a = ageSeconds(b.dt_tracker)
    if (a != null && a > feedTimeoutSecs) return true
  }

  // 2. Sustained 0 km/h
  if (b._zeroSpeedSince && now - b._zeroSpeedSince > zeroSpeedSecs * 1000) {
    return true
  }

  // 3. Stalled in place at low speed
  const speed = Number.isFinite(b.speed) ? Number(b.speed) : 0
  const moved = b._lastMovedAt
  if (speed < stallSpeedKmh && moved && now - moved > stallSecs * 1000) {
    return true
  }
  return false
}

/** Haversine distance in metres between two lat/lng points. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

/** Parse the upstream `passenger` field. Some cities omit it entirely;
 *  others ship it as a numeric string ("0", "12"). Returns null when
 *  the value is missing or unparseable. */
export function parsePassenger(p?: string | number | null): number | null {
  if (p == null || p === '') return null
  const n = typeof p === 'number' ? p : parseInt(p, 10)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}
