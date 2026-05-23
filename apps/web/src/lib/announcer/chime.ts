/**
 * Pre-announcement chime. One `<audio>` element shared across calls
 * so the browser caches the MP3 after the first playback. Returns a
 * promise that resolves when the chime finishes (or rejects if the
 * autoplay policy blocked playback).
 */

const SRC = '/sounds/alert.mp3'
let el: HTMLAudioElement | null = null

function ensureEl(): HTMLAudioElement {
  if (!el) {
    el = new Audio(SRC)
    el.preload = 'auto'
  }
  return el
}

/** Play the chime once. `volume` is 0..1. Resolves on ended;
 *  rejects if the browser refused (autoplay policy). */
export function playChime(volume = 1): Promise<void> {
  const audio = ensureEl()
  audio.volume = Math.max(0, Math.min(1, volume))
  audio.currentTime = 0
  return new Promise<void>((resolve, reject) => {
    const onEnded = () => {
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      reject(new Error('chime play failed'))
    }
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    const playPromise = audio.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        audio.removeEventListener('ended', onEnded)
        audio.removeEventListener('error', onError)
        reject(err)
      })
    }
  })
}

/** Eagerly fetch the MP3 (e.g. when the user enables audio) so the
 *  first real announcement doesn't have to wait on the network. */
export function preloadChime() {
  ensureEl().load()
}
