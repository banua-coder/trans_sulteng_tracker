/**
 * Web Speech API helpers for the announcer. Wraps voice selection
 * (sync OR async via `voiceschanged`), language-locale matching, and
 * volume. Returns a promise that resolves when the utterance finishes
 * speaking.
 */

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Resolved best voice for the requested locale prefix. Web Speech
 *  loads voices asynchronously on Chromium — `getVoices()` returns
 *  an empty list until `voiceschanged` fires. Wait up to 1s. */
async function pickVoice(langPrefix: string): Promise<SpeechSynthesisVoice | null> {
  if (!isSpeechSupported()) return null
  const all = window.speechSynthesis.getVoices()
  if (all.length) return matchVoice(all, langPrefix)
  return new Promise((resolve) => {
    let resolved = false
    const onChange = () => {
      if (resolved) return
      resolved = true
      window.speechSynthesis.removeEventListener('voiceschanged', onChange)
      resolve(matchVoice(window.speechSynthesis.getVoices(), langPrefix))
    }
    window.speechSynthesis.addEventListener('voiceschanged', onChange)
    setTimeout(() => {
      if (resolved) return
      resolved = true
      window.speechSynthesis.removeEventListener('voiceschanged', onChange)
      resolve(matchVoice(window.speechSynthesis.getVoices(), langPrefix))
    }, 1000)
  })
}

function matchVoice(
  voices: SpeechSynthesisVoice[],
  langPrefix: string,
): SpeechSynthesisVoice | null {
  return voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix.toLowerCase())) ?? null
}

export interface SpeakOptions {
  /** Locale prefix to match against installed voices, e.g. 'id' or 'en'. */
  langPrefix: string
  /** 0..1 */
  volume: number
}

export async function speak(text: string, opts: SpeakOptions): Promise<void> {
  if (!isSpeechSupported()) return
  // Cancel any queued utterances so we don't pile up overlapping
  // announcements when the user mashes a speaker button.
  window.speechSynthesis.cancel()
  const voice = await pickVoice(opts.langPrefix)
  const utter = new SpeechSynthesisUtterance(text)
  if (voice) {
    utter.voice = voice
    utter.lang = voice.lang
  } else {
    utter.lang = opts.langPrefix === 'id' ? 'id-ID' : 'en-US'
  }
  utter.volume = Math.max(0, Math.min(1, opts.volume))
  utter.rate = 1
  utter.pitch = 1
  return new Promise((resolve) => {
    utter.onend = () => resolve()
    utter.onerror = () => resolve()
    window.speechSynthesis.speak(utter)
  })
}

export function cancelSpeech() {
  if (isSpeechSupported()) window.speechSynthesis.cancel()
}
