/**
 * UI state — purely visual concerns kept out of the data stores.
 *
 *   · which sidebar sections are collapsed
 *   · the bus-search query
 *   · the map legend's open/closed state
 *
 * Each value persists to localStorage so a returning user finds the
 * panel exactly how they left it.
 */
import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'

const KEY_PANELS = 'cektrans:ui:panels'
const KEY_LEGEND = 'cektrans:ui:legend'
const KEY_SEARCH = 'cektrans:ui:busSearch'
const KEY_MOBILE_TAB = 'cektrans:ui:mobileTab'
const KEY_TILE_MODE = 'cektrans:ui:tileMode'
const KEY_AUDIO_ENABLED = 'cektrans:ui:audioEnabled'
const KEY_AUDIO_VOLUME = 'cektrans:ui:audioVolume'
const KEY_VIBRATION = 'cektrans:ui:vibrationEnabled'

export type TileMode = 'map' | 'satellite'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota / private mode
  }
}

export const useUiStore = defineStore('ui', () => {
  const panels = reactive<Record<string, boolean>>(
    readJson<Record<string, boolean>>(KEY_PANELS, {}),
  )

  const legendOpen = ref<boolean>(readJson<boolean>(KEY_LEGEND, true))

  const busSearch = ref<string>(readJson<string>(KEY_SEARCH, ''))

  type MobileTab = 'routes' | 'halte' | 'plan'
  const mobileTab = ref<MobileTab>(readJson<MobileTab>(KEY_MOBILE_TAB, 'routes'))
  const mobileScrollY = ref<number>(0)

  // Live map basemap — 'map' = CARTO Voyager/Dark Matter (theme
  // aware), 'satellite' = ESRI World Imagery. Stored so the user's
  // pick survives reloads.
  const tileMode = ref<TileMode>(readJson<TileMode>(KEY_TILE_MODE, 'map'))
  function setTileMode(next: TileMode) { tileMode.value = next }
  function toggleTileMode() { tileMode.value = tileMode.value === 'map' ? 'satellite' : 'map' }
  watch(tileMode, (v) => writeJson(KEY_TILE_MODE, v))

  // Audio announcer settings. Off by default — first interaction
  // needs to be a user gesture anyway to unlock the autoplay
  // policy. Volume is 0–100; vibration is hidden in the UI on iOS
  // (Apple doesn't ship the API) but the flag still persists in case
  // the user later opens the same browser profile on an Android
  // device.
  const audioEnabled = ref<boolean>(readJson<boolean>(KEY_AUDIO_ENABLED, false))
  const audioVolume = ref<number>(readJson<number>(KEY_AUDIO_VOLUME, 80))
  const vibrationEnabled = ref<boolean>(readJson<boolean>(KEY_VIBRATION, true))
  function setAudioEnabled(v: boolean) { audioEnabled.value = v }
  function setAudioVolume(v: number) { audioVolume.value = Math.max(0, Math.min(100, v)) }
  function setVibrationEnabled(v: boolean) { vibrationEnabled.value = v }
  watch(audioEnabled, (v) => writeJson(KEY_AUDIO_ENABLED, v))
  watch(audioVolume, (v) => writeJson(KEY_AUDIO_VOLUME, v))
  watch(vibrationEnabled, (v) => writeJson(KEY_VIBRATION, v))

  // Corridor filter for the halte tab list. null = show every halte
  // in the city. Stored in the ui store rather than the component so
  // the choice survives tab swaps and panel re-mounts. Not persisted
  // to localStorage — the filter is a temporary navigation aid, not
  // a sticky preference.
  const halteListFilterKor = ref<string | null>(null)
  function setHalteListFilter(kor: string | null) {
    halteListFilterKor.value = kor
  }
  function toggleHalteListFilter(kor: string) {
    halteListFilterKor.value = halteListFilterKor.value === kor ? null : kor
  }

  function isPanelOpen(name: string, defaultOpen = true): boolean {
    return panels[name] ?? defaultOpen
  }

  function setPanelOpen(name: string, open: boolean) {
    panels[name] = open
  }

  function togglePanel(name: string, defaultOpen = true) {
    setPanelOpen(name, !isPanelOpen(name, defaultOpen))
  }

  function setLegendOpen(open: boolean) {
    legendOpen.value = open
  }

  function setBusSearch(q: string) {
    busSearch.value = q
  }

  watch(panels, (v) => writeJson(KEY_PANELS, v), { deep: true })
  watch(legendOpen, (v) => writeJson(KEY_LEGEND, v))
  watch(busSearch, (v) => writeJson(KEY_SEARCH, v))
  watch(mobileTab, (v) => writeJson(KEY_MOBILE_TAB, v))

  // Derived helpers (kept stable so consumers can pass directly to
  // collapsibles without spawning new refs).
  const panelOpen = (name: string, defaultOpen = true) =>
    computed<boolean>({
      get: () => isPanelOpen(name, defaultOpen),
      set: (v) => setPanelOpen(name, v),
    })

  return {
    panels,
    legendOpen,
    busSearch,
    mobileTab,
    mobileScrollY,
    tileMode,
    setTileMode,
    toggleTileMode,
    audioEnabled,
    audioVolume,
    vibrationEnabled,
    setAudioEnabled,
    setAudioVolume,
    setVibrationEnabled,
    halteListFilterKor,
    isPanelOpen,
    setPanelOpen,
    togglePanel,
    setLegendOpen,
    setBusSearch,
    setHalteListFilter,
    toggleHalteListFilter,
    panelOpen,
  }
})
