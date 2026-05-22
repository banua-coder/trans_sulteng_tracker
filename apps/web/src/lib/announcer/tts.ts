/**
 * Web Speech API helpers for the announcer. Wraps voice selection
 * (sync OR async via `voiceschanged`), language-locale matching, and
 * volume. Returns a promise that resolves when the utterance finishes
 * speaking.
 */

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Touch the voice list so Chrome starts loading voices in the
 *  background. Some installs only populate getVoices() after the
 *  first call; calling this on module init means the very first
 *  announce() doesn't get stuck waiting on voiceschanged. */
if (isSpeechSupported()) {
  try {
    window.speechSynthesis.getVoices()
  } catch {
    // Some headless / privacy-mode browsers throw — ignore.
  }
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

/** Best-match voice, with graceful fallback. Order:
 *   1) exact locale prefix (e.g. 'id', 'en')
 *   2) any en-* voice (most installs have one)
 *   3) any default voice (`default === true`)
 *   4) first voice in the list
 *  Without a fallback, Chrome silently drops utterances whose
 *  `lang` (e.g. 'id-ID') doesn't match any installed voice — the
 *  symptom is "chime plays, speech doesn't". */
function matchVoice(
  voices: SpeechSynthesisVoice[],
  langPrefix: string,
): SpeechSynthesisVoice | null {
  if (!voices.length) return null
  const prefix = langPrefix.toLowerCase()
  const exact = voices.find((v) => v.lang.toLowerCase().startsWith(prefix))
  if (exact) return exact
  const english = voices.find((v) => v.lang.toLowerCase().startsWith('en'))
  if (english) return english
  const def = voices.find((v) => v.default)
  if (def) return def
  return voices[0] ?? null
}

export interface SpeakOptions {
  /** Locale prefix to match against installed voices, e.g. 'id' or 'en'. */
  langPrefix: string
  /** 0..1 */
  volume: number
}

export async function speak(text: string, opts: SpeakOptions): Promise<void> {
  if (!isSpeechSupported()) return
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
    let done = false
    let keepAlive: ReturnType<typeof setInterval> | null = null
    const finish = () => {
      if (done) return
      done = true
      if (keepAlive) clearInterval(keepAlive)
      resolve()
    }
    utter.onend = finish
    utter.onerror = finish

    // Chrome's speechSynthesis wedges into a state where
    //   `speaking: true, pending: true, paused: false`
    // but no audio plays and onstart never fires. This happens after
    // an HTMLAudio element plays right before speak(), and persists
    // across subsequent speak() calls in the same session.
    //
    // The recovery is: cancel() the wedged queue, yield one tick so
    // Chrome actually processes the cancel, then speak() with a
    // clean queue. cancel() + speak() in the same tick is a separate
    // Chrome bug (silently drops the speak), so the setTimeout(0) is
    // load-bearing.
    try { window.speechSynthesis.cancel() } catch {}
    setTimeout(() => {
      if (done) return
      try { window.speechSynthesis.speak(utter) } catch {
        finish()
        return
      }
      // Chrome also wedges utterances longer than ~15s. The classic
      // workaround is a pause/resume heartbeat while speaking.
      keepAlive = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          if (keepAlive) clearInterval(keepAlive)
          return
        }
        try {
          window.speechSynthesis.pause()
          window.speechSynthesis.resume()
        } catch {}
      }, 10000)
    }, 0)
  })
}

export function cancelSpeech() {
  if (isSpeechSupported()) window.speechSynthesis.cancel()
}

export function resumeSpeech() {
  if (!isSpeechSupported()) return
  try { window.speechSynthesis.resume() } catch {}
}
