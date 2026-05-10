/**
 * Wire DTOs from the BRT Nusantara API, exposed via our Rust proxy.
 * Field names mirror the upstream schema; most string fields can be null.
 */

export interface BrtCity {
  id: string
  name: string
  pref: string
  lat: number
  lng: number
  zoom: number
  replace_corridor: string
  icon: string
  routes: string
  timezone: string
  city: string
}

export interface BrtCorridor {
  id: string
  kor: string
  toward: string
  origin: string
  pref: string
  color: string
  points_a: string
  points_b: string
  jam_operasional: string
  is_ops: number
}

export interface BrtHalte {
  sh_id: string
  sh_name: string
  kor: string
  origin: string
  toward: string
  sh_lat: string
  sh_lng: string
  or_lat: string
  or_lng: string
  tw_lat: string
  tw_lng: string
  points: string
  color: string
  in_koridor: string
  color_koridor: string
}

export interface BrtBus {
  id: string
  imei: string
  ip?: string
  port?: string
  protocol?: string
  name?: string
  plate_number?: string
  lat: number
  lng: number
  angle: number
  speed: number
  altitude?: string
  kor: string
  toward: string
  pref: string
  dt_server?: string
  dt_tracker?: string
  ago?: string
  gap?: string
  dist_shel?: string | null
  new_shel_t?: string | null
  old_shel_t?: string | null
  passenger?: string
  loc_valid?: string

  /** Internal: wall-clock timestamp (ms) of when our store received this
   *  payload. Authoritative for stale checks since the upstream
   *  dt_tracker is unreliable (UTC without timezone marker). */
  _receivedAt?: number
  /** Internal: wall-clock timestamp (ms) of the last meaningful position
   *  change (>15 m, ignoring GPS jitter). Used together with reported
   *  speed to flag a bus as stalled rather than just slow-moving. */
  _lastMovedAt?: number
  /** Internal: wall-clock timestamp (ms) of when speed first dropped to
   *  exactly 0 km/h. Reset to null whenever speed > 0 again. */
  _zeroSpeedSince?: number | null
}

export type CitySlug = 'palu' | 'donggala'

export const CITY_PREF: Record<CitySlug, string> = {
  palu: '12',
  donggala: '11',
}

export const PREF_CITY: Record<string, CitySlug> = {
  '12': 'palu',
  '11': 'donggala',
}
