/** WCAG contrast helpers for the corridor colours, which come from the
 *  operator feed and include light ones (yellow, sky blue) where white
 *  text fails. */

const INK = '#0A0E14'
const WHITE = '#ffffff'
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Readable text colour for a corridor colour used as a background:
 *  white or ink, whichever has the higher contrast. */
export function onColor(bg: string | null | undefined): string {
  if (!bg || !HEX.test(bg)) return WHITE
  return contrast(WHITE, bg) >= contrast(INK, bg) ? WHITE : INK
}

/** True when the colour is too light to read as a line on a white map
 *  (under 3:1, the WCAG threshold for graphics). Such routes get a dark
 *  casing instead of a white one. */
export function isLightRoute(color: string | null | undefined): boolean {
  if (!color || !HEX.test(color)) return false
  return contrast(color, WHITE) < 3
}

const mix = (hex: string, t: number): string => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const out = [0, 2, 4].map((i) => Math.round(parseInt(full.slice(i, i + 2), 16) * (1 - t)))
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Background for a corridor badge that carries text. Mid-tone feed
 *  colours (blue K2A, purple K4A, magenta K4B) read badly with either
 *  white (about 3.5:1) or ink text, so darken them until white text
 *  reaches 4.5:1. Dark colours already pass and light ones keep ink
 *  text, so both come back unchanged. */
export function badgeBg(bg: string | null | undefined): string {
  if (!bg || !HEX.test(bg)) return bg || '#0EA5E9'
  if (contrast(WHITE, bg) >= 4.5 || contrast(INK, bg) >= 7.5) return bg
  for (let t = 0.04; t <= 0.6; t += 0.04) {
    const d = mix(bg, t)
    if (contrast(WHITE, d) >= 4.5) return d
  }
  return mix(bg, 0.6)
}
