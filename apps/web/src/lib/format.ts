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

/** True when a bus hasn't sent us a fresh fix in `staleSecs` (5 min default).
 *
 *  Authoritative source: `_receivedAt` — the wall-clock moment our
 *  store recorded the last upsert. Falls back to parsing dt_tracker
 *  only when _receivedAt is missing (e.g., a bus carried over from a
 *  prior session before this stamp existed). */
export function isStale(b: BrtBus, staleSecs = 5 * 60): boolean {
  if (b._receivedAt) {
    return Date.now() - b._receivedAt > staleSecs * 1000
  }
  const a = ageSeconds(b.dt_tracker)
  return a != null && a > staleSecs
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
