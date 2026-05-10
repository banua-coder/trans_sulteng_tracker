/**
 * BRT operating hours helpers.
 * TransPalu and Trans Donggala run 06:00–18:00 WITA (UTC+8) per
 * BrtRouteDto.jam_operasional. Outside that window the upstream socket
 * emits no events for these corridors.
 */

const WITA_OFFSET_MIN = 8 * 60

export interface OperatingState {
  active: boolean
  minutesUntilOpen: number
  minutesUntilClose: number
  witaHourMinute: { h: number; m: number }
}

export function operatingState(
  now: Date = new Date(),
  open = 6 * 60,
  close = 18 * 60,
): OperatingState {
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
  const witaMinutes = (utcMinutes + WITA_OFFSET_MIN) % (24 * 60)
  const active = witaMinutes >= open && witaMinutes < close
  return {
    active,
    minutesUntilOpen: active ? 0 : (open - witaMinutes + 24 * 60) % (24 * 60),
    minutesUntilClose: active ? close - witaMinutes : 0,
    witaHourMinute: { h: Math.floor(witaMinutes / 60), m: witaMinutes % 60 },
  }
}

export function formatWita(s: OperatingState): string {
  const { h, m } = s.witaHourMinute
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} WITA`
}
