/** Time + speed + distance formatters used across the UI. */

export function ageSeconds(iso?: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
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

/** True if a bus's last fix is older than `staleSecs` (default 5 min). */
export function isStale(dt_tracker?: string | null, staleSecs = 5 * 60): boolean {
  const a = ageSeconds(dt_tracker)
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
