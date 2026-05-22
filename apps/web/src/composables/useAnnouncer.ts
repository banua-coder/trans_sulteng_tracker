/**
 * Voice + chime announcer composable. Airport-style flow:
 *   chime → vibrate → speak. Caller passes a localized text map and
 *   the composable picks the right language from i18n.
 *
 * Announces are SERIALIZED through a module-level promise chain.
 * Multiple state transitions in the same watcher tick (e.g. three
 * buses approaching the same halte) would otherwise race on the
 * shared chime audio element AND queue overlapping speak() calls,
 * which Chrome quietly drops. The queue plays them one after the
 * other so each "chime → speech" cycle finishes cleanly.
 */
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import { playChime } from '@/lib/announcer/chime'
import { cancelSpeech, isSpeechSupported, resumeSpeech, speak } from '@/lib/announcer/tts'

export interface AnnounceArgs {
  /** Localized text — picks the one matching the current i18n locale. */
  text: { id: string; en: string } | string
  /** Pre-announcement sound. 'arrival' plays alert.mp3; 'none' skips. */
  chime?: 'arrival' | 'none'
  /** Vibrate on Android. Default true. */
  vibrate?: boolean
}

const VIBRATION_MS = 200

// Module-level queue: every announce() chains onto this so only one
// announcement runs at a time regardless of which composable kicked
// it off.
let queue: Promise<void> = Promise.resolve()

// Chrome pauses speechSynthesis when the tab is backgrounded. Calling
// resume() on visibility change unsticks any utterance that was
// queued while hidden.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resumeSpeech()
  })
}

export function useAnnouncer() {
  const ui = useUiStore()
  const { locale } = useI18n()

  function pickText(text: AnnounceArgs['text']): string {
    if (typeof text === 'string') return text
    return locale.value === 'id' ? text.id : text.en
  }

  function announce(args: AnnounceArgs): Promise<void> {
    queue = queue.then(() => runOne(args)).catch(() => {})
    return queue
  }

  async function runOne(args: AnnounceArgs): Promise<void> {
    if (!ui.audioEnabled) return
    const volume = ui.audioVolume / 100
    const chime = args.chime ?? 'arrival'

    if (chime === 'arrival') {
      try {
        await playChime(volume)
      } catch {
        // Autoplay refused or asset missing. Speech still attempts.
      }
    }

    // Vibration needs transient user activation, which we don't have
    // when announce fires from a websocket-driven watcher. Skip
    // silently in that case instead of letting Chrome log an
    // intervention warning on every fire.
    const canVibrate = ui.vibrationEnabled
      && args.vibrate !== false
      && 'vibrate' in navigator
      && (navigator.userActivation?.isActive ?? true)
    if (canVibrate) {
      navigator.vibrate(VIBRATION_MS)
    }

    const text = pickText(args.text)
    if (text && isSpeechSupported()) {
      await speak(text, {
        langPrefix: locale.value === 'id' ? 'id' : 'en',
        volume,
      })
    }
  }

  function stop() {
    cancelSpeech()
  }

  return { announce, stop, isSupported: isSpeechSupported }
}
