import { describe, expect, it } from 'vitest'
import { badgeBg, contrast, isLightRoute, onColor } from '@/lib/color'

describe('onColor', () => {
  it('uses white on dark corridor colours', () => {
    expect(onColor('#d60000')).toBe('#ffffff') // K1
    expect(onColor('#0f1273')).toBe('#ffffff') // K3B
  })
  it('uses ink on light corridor colours', () => {
    expect(onColor('#ffc800')).toBe('#0A0E14') // K2C
    expect(onColor('#43c0fa')).toBe('#0A0E14') // K3A
    expect(onColor('#1486ff')).toBe('#0A0E14') // K2A
  })
  it('falls back to white for bad input', () => {
    expect(onColor(undefined)).toBe('#ffffff')
    expect(onColor('red')).toBe('#ffffff')
  })
})

describe('isLightRoute', () => {
  it('flags colours under 3:1 on white', () => {
    expect(isLightRoute('#ffc800')).toBe(true)
    expect(isLightRoute('#43c0fa')).toBe(true)
    expect(isLightRoute('#d60000')).toBe(false)
  })
})

describe('badgeBg', () => {
  const feed = ['#d60000', '#1486ff', '#10a305', '#ffc800', '#43c0fa', '#0f1273', '#b467f4', '#dd36b9', '#7b3f00', '#1e00ff', '#f40606', '#16c049']
  it('gives every feed colour at least 4.5:1 with its text colour', () => {
    for (const c of feed) {
      const bg = badgeBg(c)
      expect(contrast(bg, onColor(bg)), c).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('leaves dark and light colours alone', () => {
    expect(badgeBg('#0f1273')).toBe('#0f1273')
    expect(badgeBg('#ffc800')).toBe('#ffc800')
  })
})
