import { useDark, useToggle } from '@vueuse/core'

/** Shared dark-mode state. Reads + writes html.dark and the
 *  cektrans:theme localStorage key so the choice survives reload. */
export function useTheme() {
  const isDark = useDark({
    storageKey: 'cektrans:theme',
    valueDark: 'dark',
    valueLight: 'light',
    selector: 'html',
    attribute: 'class',
  })
  const toggleTheme = useToggle(isDark)
  return { isDark, toggleTheme }
}
