/**
 * Voice + chime announcer composable. Airport-style flow:
 *   chime → vibrate → speak. Caller passes a localized text map and
 *   the composable picks the right language from i18n. Phase 1 only
 *   exposes the low-level `announce()`; high-level helpers (e.g.
 *   announceBusArrival) will land in Phase 2.
 */
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import { playChime } from '@/lib/announcer/chime'
import { cancelSpeech, isSpeechSupported, speak } from '@/lib/announcer/tts'

export interface AnnounceArgs {
  /** Localized text — picks the one matching the current i18n locale. */
  text: { id: string; en: string } | string
  /** Pre-announcement sound. 'arrival' plays alert.mp3; 'none' skips. */
  chime?: 'arrival' | 'none'
  /** Vibrate on Android. Default true. */
  vibrate?: boolean
}

const VIBRATION_MS = 200

export function useAnnouncer() {
  const ui = useUiStore()
  const { locale } = useI18n()

  function pickText(text: AnnounceArgs['text']): string {
    if (typeof text === 'string') return text
    return locale.value === 'id' ? text.id : text.en
  }

  async function announce(args: AnnounceArgs): Promise<void> {
    if (!ui.audioEnabled) return
    const volume = ui.audioVolume / 100
    const chime = args.chime ?? 'arrival'

    if (chime === 'arrival') {
      try {
        await playChime(volume)
      } catch {
        // Autoplay refused or asset missing. Speech still attempts —
        // if a user gesture is in play it might succeed.
      }
    }

    if (ui.vibrationEnabled && args.vibrate !== false && 'vibrate' in navigator) {
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
