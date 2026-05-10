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

  // Don't persist the search across reloads — it'd surprise users on
  // their next visit. Just keep it shared between desktop sidebar and
  // mobile bottom-sheet renders of BusListPanel.
  const busSearch = ref<string>(readJson<string>(KEY_SEARCH, ''))

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

  // Persistence
  watch(panels, (v) => writeJson(KEY_PANELS, v), { deep: true })
  watch(legendOpen, (v) => writeJson(KEY_LEGEND, v))
  watch(busSearch, (v) => writeJson(KEY_SEARCH, v))

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
    isPanelOpen,
    setPanelOpen,
    togglePanel,
    setLegendOpen,
    setBusSearch,
    panelOpen,
  }
})
