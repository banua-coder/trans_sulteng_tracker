import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type GeoStatus = 'idle' | 'pending' | 'granted' | 'denied' | 'unsupported'

export interface Position {
  lat: number
  lng: number
  accuracy: number
  at: number
}

const CACHE_KEY = 'cektrans:lastPos'
const CACHE_TTL_MS = 1000 * 60 * 60 * 6 // 6h — more than enough for one session

function readCache(): Position | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Position
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null
    if (Date.now() - (p.at ?? 0) > CACHE_TTL_MS) return null
    return p
  } catch {
    return null
  }
}

function writeCache(p: Position) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(p))
  } catch {
    // ignore quota / private mode
  }
}

export const useGeoStore = defineStore('geo', () => {
  const status = ref<GeoStatus>('idle')
  const position = ref<Position | null>(readCache())
  const error = ref<string | null>(null)

  // Reflect the cached position as 'granted' so the UI shows it even
  // before the user re-confirms the prompt.
  if (position.value) status.value = 'granted'

  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator

  async function request() {
    if (!supported) {
      status.value = 'unsupported'
      return
    }
    status.value = 'pending'
    error.value = null
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 60_000,
          timeout: 10_000,
        })
      })
      const p: Position = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        at: Date.now(),
      }
      position.value = p
      status.value = 'granted'
      writeCache(p)
    } catch (e) {
      const err = e as GeolocationPositionError
      if (err.code === err.PERMISSION_DENIED) status.value = 'denied'
      else status.value = 'idle'
      error.value = err.message
    }
  }

  function clear() {
    position.value = null
    status.value = 'idle'
    error.value = null
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {
      // ignore
    }
  }

  const isGranted = computed(() => status.value === 'granted' && position.value !== null)

  return { status, position, error, supported, isGranted, request, clear }
})
