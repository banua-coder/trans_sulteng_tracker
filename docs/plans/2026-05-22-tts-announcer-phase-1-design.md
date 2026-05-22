# TTS Announcer — Phase 1 Design

Date: 2026-05-22
Scope: foundation for voice + chime announcements. Settings modal,
useAnnouncer composable, autoplay-policy handling.

## Why

MitraDarat trains users to expect a chime + Indonesian voice when a
bus is nearby. cektrans should match that affordance so the live
tracker is usable without staring at the screen — especially for
trip-companion mode (Phase 3) and accessibility.

Phase 1 ships only the plumbing + UX surface. Per-halte / per-bus
speaker buttons are Phase 2; auto-announce in companion mode is
Phase 3.

## Audio flow

Airport-style: chime first, then voice, with vibration overlapping
the voice on Android.

```
user gesture → fetch alert.mp3 (cached)
            → play chime
            → await chime ended
            → if Android + vibration enabled: navigator.vibrate(200)
            → speechSynthesis.speak(utterance)
```

The chime and voice never overlap. Vibration runs alongside the
voice, not the chime, so the cue arrives just as the user lifts
their phone to listen.

### Chime source

The MP3 (~135 KB) is extracted from MitraDarat's
`res/raw/alert_nearby_bus.mp3`. Bundled at
`apps/web/public/sounds/alert.mp3`, served as a static asset, cached
by the PWA service worker on first load.

Note: this asset is owned by Kemenhub. If they object we swap to a
CC0 sample from freesound; the codepath isolates the source URL.

### TTS

Web Speech API (`window.speechSynthesis`). Voice picked
automatically:

1. List voices via `speechSynthesis.getVoices()` (handles the async
   `voiceschanged` event for browsers that lazy-load voices)
2. If app locale = `id`: prefer first voice with `lang.startsWith('id')`
3. If app locale = `en`: prefer first voice with `lang.startsWith('en')`
4. Fall back to the platform default voice

The locale also drives which language string we send to TTS — the
caller passes `text: { id: '...', en: '...' }`.

### Browser autoplay policy

Most browsers block both `<audio>` playback and
`speechSynthesis.speak()` until a user gesture has been observed.

The Settings modal's "Tes pengumuman" button doubles as the gesture
that unlocks audio for the session. We document this in the modal
copy ("Tap to enable announcements"). Later announcements within
the same session work without re-prompting.

## API

```ts
import { useAnnouncer } from '@/composables/useAnnouncer'

const announcer = useAnnouncer()

await announcer.announce({
  text: {
    id: 'Bus K1 akan segera tiba',
    en: 'Bus K1 arriving soon',
  },
  chime: 'arrival',     // 'arrival' | 'none'
  vibrate: true,        // default true
})
```

Behaviour:

- No-op (resolves immediately) when `audioEnabled === false`
- Selects the text matching the current i18n locale
- Plays chime, awaits its `ended`, then speaks
- Returns a promise that resolves when speech finishes (or rejects
  if speechSynthesis errors)

Phase 2 will add high-level helpers like `announceBusArrival(bus)`
that build the text + locale map from a `BrtBus`. We don't need
them yet.

## State (ui store)

Three new fields persisted to localStorage:

| Key                            | Type    | Default | Notes                          |
| ------------------------------ | ------- | ------- | ------------------------------ |
| `cektrans:ui:audioEnabled`     | boolean | false   | User must opt in               |
| `cektrans:ui:audioVolume`      | number  | 80      | 0-100                          |
| `cektrans:ui:vibrationEnabled` | boolean | true    | Ignored on iOS (Apple no-op)   |

Theme + language already persist via existing mechanisms; the
Settings modal binds to those.

## Settings modal

Triggered by a gear icon in TopBar. Modal layout:

```
┌─ Pengaturan ────────────────────┐
│                                 │
│  TAMPILAN                       │
│  Tema      [ Light Dark Sistem ]│
│  Bahasa    [   ID         EN   ]│
│                                 │
│  PENGUMUMAN SUARA               │
│  Aktifkan audio          [ off ]│
│  Volume     ──────●────    80%  │
│  Getaran                 [ on  ]│  ← hidden on iOS
│                                 │
│  [ Tes pengumuman ]             │
│                                 │
│              [ Tutup ]          │
└─────────────────────────────────┘
```

The Volume slider takes effect only when audio is enabled (greyed
out otherwise). The Getaran toggle is hidden entirely on iOS via a
runtime check (`'vibrate' in navigator === false`).

### Theme picker

Adds a third option `system` (follows OS via `prefers-color-scheme`).
Current binary light/dark stays the underlying state, with `system`
modeled as `'system' | 'light' | 'dark'` in the theme store. The
effective theme = explicit choice, or the media query result when
`system`.

## TopBar changes

Removed:
- Language toggle (ID button)
- Theme toggle (moon/sun)

Added:
- Gear icon (`⚙`) on the right that opens SettingsModal

Order: BanuacoderLogo · /cektrans link · city switcher · status
badge · DonateButton · Download Map link · ⚙ Settings.

## File structure

```
apps/web/
├── public/
│   └── sounds/
│       └── alert.mp3                ← copied from MitraDarat
├── src/
│   ├── composables/
│   │   └── useAnnouncer.ts          ← new
│   ├── components/
│   │   ├── SettingsModal.vue        ← new
│   │   └── TopBar.vue               ← updated (remove ID + theme,
│   │                                  add gear)
│   ├── lib/
│   │   └── announcer/
│   │       ├── chime.ts             ← chime playback
│   │       └── tts.ts               ← speechSynthesis helpers
│   └── stores/
│       ├── ui.ts                    ← audio settings
│       └── theme.ts (or lib/theme)  ← gains 'system' option
```

## Out of scope (defer)

- Voice picker dropdown (timing issues with async voice list;
  diagnostic-only label is enough for Phase 1)
- Multiple chime kinds (departure, alert, destination) — only
  `arrival` and `none` for Phase 1
- Per-halte / per-bus speaker buttons (Phase 2)
- Companion-mode auto-announce (Phase 3)
- Background audio when screen locks (best-effort)

## Risks

- **Autoplay policy**: covered by the "Tes pengumuman" gesture
- **No Indonesian voice installed**: degrades to platform default;
  pronunciation of place names suffers but still intelligible
- **iOS vibration absent**: toggle hidden, no broken UI
- **MitraDarat MP3 license**: documented above; swap-out path
  ready

## Acceptance

1. Audio off by default; the gear-icon modal opens with everything
   disabled.
2. Toggling on and tapping "Tes pengumuman" plays
   `chime → "Tes pengumuman cektrans"` in Indonesian.
3. Switching language to EN and re-testing speaks English (when an
   English voice is installed).
4. Refreshing the page preserves all three audio settings + theme +
   language choices.
5. iOS Safari hides the vibration toggle; everything else works.
6. Disabling audio mid-announcement immediately stops the voice.
