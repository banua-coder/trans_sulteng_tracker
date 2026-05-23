/**
 * Trip-share helpers — hashtag set, deep-link URL builder, and the
 * text payload used alongside the share card image. Per-city
 * defaults keep operator branding consistent across the social
 * loop (#TransPalu / #TransDonggala) while the #cektrans and
 * #banuacoder tags ride along on every share for attribution.
 */
import type { CitySlug } from '@/types/brt'

export const SHARE_HASHTAGS: Record<CitySlug, readonly string[]> = {
  palu: ['#ayonaiktransum', '#TransPalu', '#cektrans', '#banuacoder'],
  donggala: ['#ayonaikbus', '#TransDonggala', '#cektrans', '#banuacoder'],
}

export interface ShareUrlInput {
  city: CitySlug
  origin: { lat: number; lng: number; label?: string }
  destination: { lat: number; lng: number; label?: string }
  corridors: string[]
}

/** Hash-encoded deep link. No backend — decoding lives in the trip
 *  planner which pre-fills origin/destination/corridor hint on
 *  mount. Failure to decode opens the city normally. */
export function buildShareUrl(input: ShareUrlInput, base = location.origin): string {
  const payload = {
    o: [round(input.origin.lat), round(input.origin.lng), input.origin.label ?? ''],
    d: [round(input.destination.lat), round(input.destination.lng), input.destination.label ?? ''],
    k: input.corridors,
  }
  const encoded = base64UrlEncode(JSON.stringify(payload))
  return `${base}/${input.city}?trip=${encoded}`
}

export function decodeShareUrl(raw: string): Partial<ShareUrlInput> | null {
  try {
    const json = base64UrlDecode(raw)
    const obj = JSON.parse(json) as { o: [number, number, string]; d: [number, number, string]; k: string[] }
    return {
      origin: { lat: obj.o[0], lng: obj.o[1], label: obj.o[2] || undefined },
      destination: { lat: obj.d[0], lng: obj.d[1], label: obj.d[2] || undefined },
      corridors: obj.k ?? [],
    } as Partial<ShareUrlInput>
  } catch {
    return null
  }
}

export interface SharePayload {
  city: CitySlug
  origin: string
  destination: string
  durationMin: number
  corridors: string[]
  url: string
}

export function buildShareText(p: SharePayload): string {
  const tags = SHARE_HASHTAGS[p.city].join(' ')
  const kors = p.corridors.length ? p.corridors.join(' → ') : ''
  const route = kors ? `${kors} ` : ''
  return `Naik ${route}${p.origin} → ${p.destination} dalam ${p.durationMin} menit · cektrans ${tags} ${p.url}`
}

function round(n: number): number {
  return Math.round(n * 1e5) / 1e5     // ~1 m precision
}

function base64UrlEncode(s: string): string {
  const b64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s, 'utf-8').toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(s: string): string {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  return typeof atob === 'function'
    ? decodeURIComponent(escape(atob(b64)))
    : Buffer.from(b64, 'base64').toString('utf-8')
}
