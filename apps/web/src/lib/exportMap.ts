/**
 * Helpers used by the printable corridor booklet (CorridorMapPage,
 * CorridorMapSheet). Kept out of the Vue files so the components stay
 * thin renderers and the logic is unit-testable without mounting.
 */
import type { BrtHalte } from '@/types/brt'

/** A halte is a transfer point when its `in_koridor` pipe-list names
 *  two or more corridors. The bulk feed packs every corridor that
 *  passes through a physical stop into this field. */
export function isTransfer(h: BrtHalte): boolean {
  return h.in_koridor ? h.in_koridor.split('|').filter(Boolean).length > 1 : false
}

/** Corridors that pass through this halte other than the current one
 *  we're rendering. Used to render the chips next to a transfer
 *  stop's name in the legend. */
export function otherCorridorsAt(h: BrtHalte, currentKor: string): string[] {
  if (!h.in_koridor) return []
  return h.in_koridor.split('|').filter((k) => k && k !== currentKor)
}

/** Lookup table of halte sh_name → its position in the leg's ordered
 *  sequence. Drives the number on the map dot and the number in the
 *  side legend so they stay in sync across pages. */
export function buildHalteIndex(legHalte: readonly BrtHalte[]): Map<string, number> {
  const m = new Map<string, number>()
  legHalte.forEach((h, i) => m.set(h.sh_name, i))
  return m
}

/** Indonesian month names for the print "diperbarui DD Bulan YYYY"
 *  footer. Cheap enough to inline here so the component doesn't carry
 *  the array. */
const ID_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]
export function formatIndonesianDate(d: Date): string {
  return `${d.getDate()} ${ID_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
