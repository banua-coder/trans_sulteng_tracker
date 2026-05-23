/**
 * Plan → drawable path segments. Decodes corridor polylines, slices
 * each ride leg between its boarding and alighting halte, and walks
 * each step into a list of polylines the renderer can consume.
 *
 * Extracted from MapView so the trip preview and the share card
 * both render the same geometry — straight chords would otherwise
 * leak into the share image.
 */
import polyline from '@mapbox/polyline'
import type { PlanResult } from '@/lib/tripPlanner'
import type { BrtCorridor, BrtHalte } from '@/types/brt'
import { haversineM } from '@/lib/geo'

export type LatLngTuple = [number, number]

export interface TripPathSegment {
  kind: 'ride' | 'walk'
  coords: LatLngTuple[]
  color: string
}

interface BrtAccess {
  corridorByKor: Map<string, BrtCorridor>
  halte: readonly BrtHalte[]
  colorForKor: (kor: string) => string | null
}

export function buildTripPaths(
  plan: PlanResult,
  brt: BrtAccess,
  origin: LatLngTuple | null,
  destination: LatLngTuple | null,
): TripPathSegment[] {
  const out: TripPathSegment[] = []
  let lastEnd: LatLngTuple | null = origin

  for (const step of plan.steps) {
    if (step.kind === 'ride' && step.kor) {
      const from = halteCoord(brt.halte, step.fromName, step.kor)
      const to = halteCoord(brt.halte, step.toName, step.kor)
      if (!from || !to) continue
      const slice = corridorSlice(brt.corridorByKor, step.kor, from, to)
      const coords = slice ?? [from, to]
      out.push({
        kind: 'ride',
        coords,
        color: brt.colorForKor(step.kor) || '#1D9CD4',
      })
      lastEnd = to
    } else if (step.kind === 'walk') {
      const to = halteCoord(brt.halte, step.toName, undefined)
        ?? (isFinalWalk(step, plan) ? destination : null)
      if (lastEnd && to) {
        out.push({ kind: 'walk', coords: [lastEnd, to], color: '#6b7280' })
        lastEnd = to
      }
    } else if (step.kind === 'transfer') {
      const to = halteCoord(brt.halte, step.toName, undefined)
      if (lastEnd && to) {
        out.push({ kind: 'walk', coords: [lastEnd, to], color: '#6b7280' })
        lastEnd = to
      }
    }
  }
  return out
}

function isFinalWalk(
  step: PlanResult['steps'][number],
  plan: PlanResult,
): boolean {
  return plan.steps[plan.steps.length - 1] === step && step.kind === 'walk'
}

function halteCoord(
  halte: readonly BrtHalte[],
  name: string,
  kor: string | undefined,
): LatLngTuple | null {
  const h = (kor && halte.find((x) => x.sh_name === name && x.kor === kor))
    ?? halte.find((x) => x.sh_name === name)
  if (!h) return null
  const lat = parseFloat(h.sh_lat)
  const lng = parseFloat(h.sh_lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return [lat, lng]
}

/** Slice a corridor polyline between two halte coordinates. Tries
 *  both legs (points_a forward, points_b reverse) and returns the
 *  one with the smallest snap distance + forward direction. */
export function corridorSlice(
  corridorByKor: Map<string, BrtCorridor>,
  kor: string,
  from: LatLngTuple,
  to: LatLngTuple,
): LatLngTuple[] | null {
  const c = corridorByKor.get(kor)
  if (!c) return null

  function trySlice(enc: string | undefined | null) {
    if (!enc) return null
    let pts: LatLngTuple[]
    try { pts = polyline.decode(enc) as LatLngTuple[] } catch { return null }
    if (pts.length < 2) return null
    let fromIdx = 0
    let fromDist = Infinity
    let toIdx = 0
    let toDist = Infinity
    for (let i = 0; i < pts.length; i++) {
      const p = { lat: pts[i][0], lng: pts[i][1] }
      const df = haversineM({ lat: from[0], lng: from[1] }, p)
      const dt = haversineM({ lat: to[0], lng: to[1] }, p)
      if (df < fromDist) { fromDist = df; fromIdx = i }
      if (dt < toDist) { toDist = dt; toIdx = i }
    }
    if (fromIdx >= toIdx) return null
    return { slice: pts.slice(fromIdx, toIdx + 1), snap: fromDist + toDist }
  }

  const a = trySlice(c.points_a)
  const b = trySlice(c.points_b)
  if (!a && !b) return null
  if (a && !b) return a.slice
  if (!a && b) return b.slice
  return a!.snap <= b!.snap ? a!.slice : b!.slice
}
