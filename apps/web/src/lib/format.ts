/** Time + speed + distance formatters used across the UI. */

import type { BrtBus, BrtHalte } from '@/types/brt'

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

/** Average BRT cruising speed (km/h) used when the bus is stopped/slow
 *  but we still want a rough ETA for the next halte. Calibrated from
 *  observed payloads — Trans Palu corridors average ~22 km/h. */
const FALLBACK_AVG_SPEED_KMH = 22

/**
 * Estimate ETA from a moving bus to its declared next halte.
 *
 * Prefers the upstream-reported `dist_shel` when available, otherwise
 * falls back to a haversine between the bus's current fix and the
 * halte's coordinates. For ETA, uses the bus's reported speed when it
 * is above a usable threshold (5 km/h), otherwise a configurable
 * fallback so a momentarily-stopped bus still produces a sane
 * "~3 min" number instead of nothing.
 *
 * Returns null when we have no way to compute either (no halte, no
 * coords, no upstream distance).
 */
export function etaToHalte(
  bus: Pick<BrtBus, 'lat' | 'lng' | 'speed' | 'dist_shel'>,
  halte: { sh_lat?: string | number; sh_lng?: string | number } | null | undefined,
): { distM: number; etaMin: number } | null {
  let distM: number | null = null

  // Prefer upstream-reported distance to next halte
  if (bus.dist_shel != null && bus.dist_shel !== '') {
    const parsed = parseFloat(String(bus.dist_shel))
    if (Number.isFinite(parsed) && parsed >= 0) distM = parsed
  }

  // Fallback: haversine from bus → halte
  if (distM == null && halte) {
    const hLat = typeof halte.sh_lat === 'string' ? parseFloat(halte.sh_lat) : halte.sh_lat
    const hLng = typeof halte.sh_lng === 'string' ? parseFloat(halte.sh_lng) : halte.sh_lng
    if (
      Number.isFinite(hLat) &&
      Number.isFinite(hLng) &&
      Number.isFinite(bus.lat) &&
      Number.isFinite(bus.lng)
    ) {
      distM = haversineMeters(
        { lat: bus.lat, lng: bus.lng },
        { lat: hLat as number, lng: hLng as number },
      )
    }
  }

  if (distM == null) return null

  const speed = Number.isFinite(bus.speed) ? Number(bus.speed) : 0
  const usableSpeed = speed >= 5 ? speed : FALLBACK_AVG_SPEED_KMH
  const etaMin = (distM / 1000) / usableSpeed * 60
  return { distM, etaMin }
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
  stallSecs = 5 * 60,
  zeroSpeedSecs = 5 * 60,
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

/** ETA reliability for the green/orange/gray "Bus Arrival Time Guide"
 *  signal used by IncomingBusCard, BusDetailCard, and HalteDetailCard.
 *
 *  - 'good'   bus is moving (speed ≥ 5 km/h) and fresh → ETA is accurate.
 *  - 'warn'   bus is fresh but stopped or crawling → ETA may slip a bit.
 *  - 'stale'  isStale === true → ETA isn't reliable; don't trust to the minute.
 *
 *  Mirrors the TJ Transjakarta "Bus Arrival Time Guide" colors. */
export function getEtaQuality(b: BrtBus | null | undefined): 'good' | 'warn' | 'stale' {
  if (!b) return 'stale'
  if (isStale(b)) return 'stale'
  const speed = Number.isFinite(b.speed) ? Number(b.speed) : 0
  if (speed >= 5) return 'good'
  return 'warn'
}

/** Index of the next halte the bus will visit along its current leg.
 *
 *  We can't trust `bus.new_shel_t` alone: upstream updates it only when
 *  the bus reaches a stop, so a bus that has driven past a halte still
 *  reports the halte it just left. Worse, terminus halte (Donggala's
 *  Wisma Donggala, Pantoloan, etc.) appear in BOTH leg directions with
 *  the same `sh_id`, so a bus parked at the terminus stays "pointing"
 *  at it forever even after it's started the reverse leg.
 *
 *  The fix: find the halte whose coords are closest to the bus's
 *  current GPS, then check whether the bus is approaching it or has
 *  already passed it (i.e. is the NEXT halte closer than the closest?).
 *  Returns the leg index the bus is heading toward — never one it has
 *  already passed.
 *
 *  Falls back to the `new_shel_t` index when GPS is missing. */
export function busLegProgress(
  bus: Pick<BrtBus, 'lat' | 'lng' | 'new_shel_t' | 'old_shel_t'>,
  orderedHalte: BrtHalte[],
): number {
  if (!orderedHalte.length) return 0

  // Hard lower bound: if upstream tagged `old_shel_t` = halte N, the
  // bus has confirmed leaving N, so upcoming starts at N+1 at the
  // earliest. This is what makes a just-passed halte disappear from
  // the upcoming list immediately instead of lingering until the bus
  // crosses the geographic midpoint to the next halte.
  let lowerBound = 0
  if (bus.old_shel_t) {
    const oldIdx = orderedHalte.findIndex((h) => h.sh_id === bus.old_shel_t)
    if (oldIdx >= 0) lowerBound = Math.min(oldIdx + 1, orderedHalte.length - 1)
  }

  const hasGps = Number.isFinite(bus.lat) && Number.isFinite(bus.lng)
  if (!hasGps) {
    if (bus.new_shel_t) {
      const idx = orderedHalte.findIndex((h) => h.sh_id === bus.new_shel_t)
      if (idx >= 0) return Math.max(idx, lowerBound)
    }
    return lowerBound
  }

  const busPt = { lat: bus.lat as number, lng: bus.lng as number }
  let closestIdx = 0
  let closestDist = Infinity
  const dists: number[] = new Array(orderedHalte.length)
  for (let i = 0; i < orderedHalte.length; i++) {
    const h = orderedHalte[i]
    const hLat = parseFloat(h.sh_lat)
    const hLng = parseFloat(h.sh_lng)
    if (!Number.isFinite(hLat) || !Number.isFinite(hLng)) {
      dists[i] = Infinity
      continue
    }
    const d = haversineMeters(busPt, { lat: hLat, lng: hLng })
    dists[i] = d
    if (d < closestDist) {
      closestDist = d
      closestIdx = i
    }
  }

  // Bus past closestIdx? If the NEXT halte on the leg is closer to the
  // bus than the closest itself, the bus has driven past closestIdx and
  // closestIdx+1 is the real upcoming stop. Otherwise the bus is still
  // approaching closestIdx (or parked at it) and that's the upcoming.
  let geoIdx = closestIdx
  if (closestIdx < orderedHalte.length - 1) {
    const distNext = dists[closestIdx + 1]
    if (Number.isFinite(distNext) && distNext < closestDist) {
      geoIdx = closestIdx + 1
    }
  }

  // Only honor the upstream-derived lower bound if GPS agrees within
  // one halte. Upstream sometimes flips `old_shel_t` to a halte well
  // ahead of the bus's actual position (K4A bug: old_shel_t jumps to
  // a halte near TAMAN GOR while the bus is still upstream of Gajah
  // Mada). Without this guard, the bus visually skips multiple stops.
  if (lowerBound <= geoIdx + 1) return Math.max(geoIdx, lowerBound)
  return geoIdx
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

/** Parse the upstream `prosen` field — trip progress along the
 *  corridor, 0–99. Trans Donggala ships this; Trans Palu doesn't.
 *  Negative values are sentinels (e.g. -1550 = "not on route yet")
 *  and treated as missing. */
export function parseProgress(p?: string | number | null): number | null {
  if (p == null || p === '') return null
  const n = typeof p === 'number' ? p : parseFloat(p)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return n
}

/** Format an Indonesian plate ("DN 7576 AU") for the TTS announcer.
 *  Without this helper speech-synth reads "DN" as "den", "7576" as
 *  "tujuh ribu lima ratus tujuh puluh enam", and "AU" as "satuan
 *  astronomi". Spacing the characters makes every voice we tested
 *  spell letters individually and pronounce digits one-by-one, and
 *  the commas between chunks give a tiny pause that matches how a
 *  conductor reads a plate out loud.
 *
 *  Examples:
 *    "DN 7576 AU"  → "D N, 7 5 7 6, A U"
 *    "B 1234 ABC"  → "B, 1 2 3 4, A B C"
 *    null / ""     → ""
 */
export function formatPlateForSpeech(plate?: string | null): string {
  if (!plate) return ''
  return plate
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => chunk.replace(/[^A-Z0-9]/g, '').split('').join(' '))
    .filter(Boolean)
    .join(', ')
}
