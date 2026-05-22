import { computed, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'cektrans:themeMode'
// Legacy key written by the previous binary useDark() implementation.
// We read it once at boot so existing users keep their preference.
const LEGACY_KEY = 'cektrans:theme'

function readMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  const legacy = localStorage.getItem(LEGACY_KEY)
  if (legacy === 'dark') return 'dark'
  if (legacy === 'light') return 'light'
  return 'system'
}

// Module-level so all useTheme() callers share the same state.
const mode = ref<ThemeMode>(readMode())
const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)')

const isDark = computed(() =>
  mode.value === 'system' ? systemPrefersDark.value : mode.value === 'dark',
)

// Mirror to html.dark + persist whenever the resolved state changes.
watch(
  [mode, isDark],
  ([m, dark]) => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem(STORAGE_KEY, m)
    // Keep the legacy key in sync so the inline boot script in
    // main.ts keeps pre-painting correctly until a future cleanup.
    localStorage.setItem(LEGACY_KEY, dark ? 'dark' : 'light')
  },
  { immediate: true },
)

function setMode(next: ThemeMode) { mode.value = next }
function toggleTheme() {
  // Binary toggle for the old call sites — cycle between light + dark
  // ignoring the 'system' option (which is reachable only via Settings).
  mode.value = isDark.value ? 'light' : 'dark'
}

/** Shared dark-mode state. Exposes `isDark` for reading, `mode` for
 *  the Settings picker, and `toggleTheme()` for the legacy binary
 *  switch path. */
export function useTheme() {
  return { isDark, mode, setMode, toggleTheme }
}
