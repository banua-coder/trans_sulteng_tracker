import type { BrtCity, BrtCorridor, BrtHalte } from '@/types/brt'

const BASE = '/api'

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json' },
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return (await r.json()) as T
}

export const api = {
  cities: () => getJson<BrtCity[]>('/cities'),
  corridors: (pref: string) => getJson<BrtCorridor[]>(`/cities/${pref}/corridors`),
  halte: (pref: string) => getJson<BrtHalte[]>(`/cities/${pref}/halte`),
  halteByCorridor: (pref: string, kor: string) =>
    getJson<BrtHalte[]>(`/cities/${pref}/halte/${encodeURIComponent(kor)}`),
  health: () => getJson<{ status: string; upstream: string; token: string }>('/health'),
}
