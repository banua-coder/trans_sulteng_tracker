/**
 * The printable corridor booklet has one map per page (a dozen or
 * more). Each OpenFreeMap basemap is a WebGL context, and browsers
 * keep about 16 alive, silently killing the oldest, so some pages came
 * out with no tiles. Printing a live WebGL canvas can also come out
 * blank. So the basemap is drawn once, copied to a still image, and the
 * context is released before the next page starts.
 */
import L from 'leaflet'
import { exportTiles } from '@/lib/leaflet/tiles'

const LIMIT = 3
const IDLE_TIMEOUT_MS = 12_000
let active = 0
const waiters: Array<() => void> = []

async function inSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= LIMIT) await new Promise<void>((resolve) => waiters.push(resolve))
  active++
  try {
    return await fn()
  } finally {
    active--
    waiters.shift()?.()
  }
}

/** Render the basemap for the map's current view and return it as an
 *  image overlay, or null when cancelled or it could not be drawn. */
export function snapshotBasemap(
  map: L.Map,
  isCancelled: () => boolean,
): Promise<L.ImageOverlay | null> {
  return inSlot(async () => {
    if (isCancelled()) return null
    const layer = exportTiles().addTo(map)
    try {
      const gl = layer.getMaplibreMap()
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, IDLE_TIMEOUT_MS)
        gl.once('idle', () => { clearTimeout(timer); resolve() })
      })
      if (isCancelled()) return null
      const url = gl.getCanvas().toDataURL('image/png')
      return L.imageOverlay(url, map.getBounds(), { pane: 'tilePane', interactive: false })
    } catch {
      return null
    } finally {
      layer.remove()
    }
  })
}
