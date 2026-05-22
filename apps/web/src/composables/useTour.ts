/**
 * Release-aware product tour built on Driver.js.
 *
 * `start()` walks the user through the elements tagged
 * `data-tour="…"` for the current major.minor version, in the order
 * declared in TOURS. `maybeStartForVersion()` runs once per release
 * — it compares APP_VERSION against the last-seen marker in
 * localStorage and skips when there is nothing new to show.
 */
import { nextTick } from 'vue'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useI18n } from 'vue-i18n'
import { APP_VERSION } from '@/lib/version'

const SEEN_KEY = 'cektrans:lastSeenTourVersion'

interface TourStepDef {
  selector: string
  titleKey: string
  bodyKey: string
}

// Keyed by major.minor — patch releases reuse the same tour. Order
// here is the playback order.
const TOURS: Record<string, TourStepDef[]> = {
  '0.8': [
    {
      selector: '[data-tour="settings-button"]',
      titleKey: 'tour.v080.settings.title',
      bodyKey: 'tour.v080.settings.body',
    },
    {
      selector: '[data-tour="basemap-toggle"]',
      titleKey: 'tour.v080.basemap.title',
      bodyKey: 'tour.v080.basemap.body',
    },
    {
      selector: '[data-tour="halte-filter"]',
      titleKey: 'tour.v080.halteFilter.title',
      bodyKey: 'tour.v080.halteFilter.body',
    },
    {
      selector: '[data-tour="export-map"]',
      titleKey: 'tour.v080.exportMap.title',
      bodyKey: 'tour.v080.exportMap.body',
    },
  ],
}

function majorMinor(v: string): string {
  const [a, b] = v.split('.')
  return `${a}.${b}`
}

export function useTour() {
  const { t } = useI18n()

  function buildSteps(): DriveStep[] {
    const def = TOURS[majorMinor(APP_VERSION)] ?? []
    return def
      // Skip steps whose target isn't on the current page — Driver
      // would otherwise throw / scroll to nothing.
      .filter((s) => document.querySelector(s.selector))
      .map((s) => ({
        element: s.selector,
        popover: {
          title: t(s.titleKey),
          description: t(s.bodyKey),
        },
      }))
  }

  function start() {
    const steps = buildSteps()
    if (!steps.length) return
    const d = driver({
      steps,
      showProgress: true,
      allowClose: true,
      nextBtnText: t('tour.next'),
      prevBtnText: t('tour.prev'),
      doneBtnText: t('tour.done'),
      onDestroyStarted: () => {
        localStorage.setItem(SEEN_KEY, APP_VERSION)
        d.destroy()
      },
    })
    d.drive()
  }

  /** Boot helper — runs once after Vue mounts. Returns silently if the
   *  user has seen this version's tour or if no steps target the
   *  current view. */
  async function maybeStartForVersion() {
    const seen = localStorage.getItem(SEEN_KEY)
    if (seen && majorMinor(seen) === majorMinor(APP_VERSION)) return
    // Give the route/sheet a tick to render before measuring targets.
    await nextTick()
    await new Promise((r) => setTimeout(r, 600))
    start()
  }

  function reset() {
    localStorage.removeItem(SEEN_KEY)
  }

  return { start, maybeStartForVersion, reset }
}
