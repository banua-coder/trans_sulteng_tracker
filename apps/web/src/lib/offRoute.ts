/**
 * Wrong-corridor detection. A bus is registered to one corridor (kor)
 * but the driver sometimes takes another line, so its position is far
 * from the corridor it claims. We measure the distance to that
 * corridor's drawn lines; a moving bus well beyond them is off-route,
 * and if it sits on another corridor we say which one.
 */
import polyline from '@mapbox/polyline'

export type Line = Array<[number, number]>

/** Further than this from its own corridor (and moving) is off-route.
 *  The feed's own parked buses sit within ~80 m; 250 m clears GPS
 *  noise, stop bays and one-way detours. */
export const OFF_ROUTE_M = 250
/** Within this of another corridor counts as "on" that corridor. */
export const ON_ROUTE_M = 80
/** Slower than this the bus may be at a depot or a stop, so no verdict. */
export const MIN_MOVING_KMH = 5
/** Must stay off-route this long, so one bad fix never raises it. */
export const OFF_ROUTE_HOLD_MS = 15_000

export function decodeLines(points: Array<string | null | undefined>): Line[] {
  const out: Line[] = []
  for (const enc of points) {
    if (!enc) continue
    try {
      const pts = polyline.decode(enc) as Line
      if (pts.length >= 2) out.push(pts)
    } catch {
      // ignore malformed polyline
    }
  }
  return out
}

const M_PER_DEG_LAT = 110_540
const M_PER_DEG_LNG = 111_320

/** Shortest distance in metres from a point to any segment of the lines. */
export function distanceToLines(p: [number, number], lines: Line[]): number {
  const cos = Math.cos((p[0] * Math.PI) / 180)
  let best = Infinity
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const ax = (line[i - 1][1] - p[1]) * M_PER_DEG_LNG * cos
      const ay = (line[i - 1][0] - p[0]) * M_PER_DEG_LAT
      const bx = (line[i][1] - p[1]) * M_PER_DEG_LNG * cos
      const by = (line[i][0] - p[0]) * M_PER_DEG_LAT
      const dx = bx - ax
      const dy = by - ay
      const len2 = dx * dx + dy * dy
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
      const d = Math.hypot(ax + t * dx, ay + t * dy)
      if (d < best) best = d
    }
  }
  return best
}

export interface OffRoute {
  /** Metres from the corridor the bus is registered to. */
  m: number
  /** The corridor it is actually on, if it is within ON_ROUTE_M of one. */
  onKor: string | null
}

/** Verdict for one position: null when on its own corridor. */
export function locateOffRoute(
  p: [number, number],
  ownKor: string,
  linesByKor: Map<string, Line[]>,
): OffRoute | null {
  const own = linesByKor.get(ownKor)
  if (!own) return null
  const m = distanceToLines(p, own)
  if (m <= OFF_ROUTE_M) return null
  let onKor: string | null = null
  let best = ON_ROUTE_M
  for (const [kor, lines] of linesByKor) {
    if (kor === ownKor) continue
    const d = distanceToLines(p, lines)
    if (d <= best) {
      best = d
      onKor = kor
    }
  }
  return { m: Math.round(m), onKor }
}
