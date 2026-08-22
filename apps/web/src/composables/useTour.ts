/**
 * Release-aware product tour built on Driver.js.
 *
 * Two modes:
 *  - First-time users (no seen marker) get FULL_TOUR — a guided
 *    walkthrough of every primary feature.
 *  - Returning users on a new release see TOURS[majorMinor] — only
 *    the steps for what changed in that version.
 *
 * Either way the seen marker is written when the tour ends, so the
 * full tour never replays once the user has been onboarded.
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

// Full onboarding for first-time users. Order: orient → explore →
// customize. Each selector must be queryable on the city view; steps
// whose target isn't currently in the DOM are filtered out so the
// tour still works on narrower screens or different routes.
const FULL_TOUR: TourStepDef[] = [
  {
    selector: '[data-tour="city-switcher"]',
    titleKey: 'tour.full.city.title',
    bodyKey: 'tour.full.city.body',
  },
  {
    selector: '[data-tour="my-location"]',
    titleKey: 'tour.full.myLocation.title',
    bodyKey: 'tour.full.myLocation.body',
  },
  {
    selector: '[data-tour="basemap-toggle"]',
    titleKey: 'tour.full.basemap.title',
    bodyKey: 'tour.full.basemap.body',
  },
  {
    selector: '[data-tour="halte-filter"]',
    titleKey: 'tour.full.halteFilter.title',
    bodyKey: 'tour.full.halteFilter.body',
  },
  {
    selector: '[data-tour="export-map"]',
    titleKey: 'tour.full.exportMap.title',
    bodyKey: 'tour.full.exportMap.body',
  },
  {
    selector: '[data-tour="settings-button"]',
    titleKey: 'tour.full.settings.title',
    bodyKey: 'tour.full.settings.body',
  },
]

// Per-release deltas. Keyed by major.minor; patch releases reuse the
// same tour. Order here is playback order.
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

/** Below this many surviving steps, a tour reads as one orphaned
 *  popover rather than a guided walkthrough — this is what happened
 *  when the tour used to auto-fire on Home and only its
 *  settings-button step had a matching target there. App.vue now
 *  gates tour launch to the city route, which is the real fix; this
 *  is a backstop for any future tour/route mismatch we haven't
 *  anticipated, so a badly-timed launch degrades to "no tour" instead
 *  of a single stray coach-mark. Exported so the threshold itself is
 *  unit-testable without mocking driver.js. */
export const MIN_TOUR_STEPS = 2

export function isTourWorthShowing(stepCount: number): boolean {
  return stepCount >= MIN_TOUR_STEPS
}

export function useTour() {
  const { t } = useI18n()

  function toDriveSteps(def: TourStepDef[]): DriveStep[] {
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

  function run(steps: DriveStep[]) {
    if (!isTourWorthShowing(steps.length)) return
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

  /** Run the per-release delta tour for the current version. */
  function start() {
    run(toDriveSteps(TOURS[majorMinor(APP_VERSION)] ?? []))
  }

  /** Run the full onboarding tour (every primary feature). */
  function startFullTour() {
    run(toDriveSteps(FULL_TOUR))
  }

  /** Boot helper — runs once after Vue mounts.
   *   - first visit ever (no seen marker) → full onboarding
   *   - new release with a delta tour → release tour
   *   - already on current release → nothing */
  async function maybeStartForVersion() {
    const seen = localStorage.getItem(SEEN_KEY)
    if (seen && majorMinor(seen) === majorMinor(APP_VERSION)) return
    // Give the route/sheet a tick to render before measuring targets.
    await nextTick()
    await new Promise((r) => setTimeout(r, 600))
    if (!seen) startFullTour()
    else start()
  }

  function reset() {
    localStorage.removeItem(SEEN_KEY)
  }

  return { start, startFullTour, maybeStartForVersion, reset }
}
