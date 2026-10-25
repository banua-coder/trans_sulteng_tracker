/**
 * Release-aware product tour. The UI lives in components/TourCoach.vue;
 * this module owns which steps run and when.
 *
 * Two modes:
 *  - First-time users (no seen marker) get FULL_TOUR, a walkthrough of
 *    every primary feature.
 *  - Returning users on a new release see TOURS[majorMinor], only the
 *    steps for what changed in that version.
 *
 * Either way the seen marker is written when the tour ends, so the
 * full tour never replays once the user has been onboarded.
 */
import { nextTick, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { APP_VERSION } from '@/lib/version'

const SEEN_KEY = 'cektrans:lastSeenTourVersion'

interface TourStepDef {
  selector: string
  titleKey: string
  bodyKey: string
}

export interface TourStep {
  selector: string
  title: string
  body: string
}

// Order: orient, explore, customize. Steps whose target is not on
// screen are dropped so the tour still works on narrower layouts.
const FULL_TOUR: TourStepDef[] = [
  { selector: '[data-tour="city-switcher"]', titleKey: 'tour.full.city.title', bodyKey: 'tour.full.city.body' },
  { selector: '[data-tour="my-location"]', titleKey: 'tour.full.myLocation.title', bodyKey: 'tour.full.myLocation.body' },
  { selector: '[data-tour="basemap-toggle"]', titleKey: 'tour.full.basemap.title', bodyKey: 'tour.full.basemap.body' },
  { selector: '[data-tour="halte-filter"]', titleKey: 'tour.full.halteFilter.title', bodyKey: 'tour.full.halteFilter.body' },
  { selector: '[data-tour="export-map"]', titleKey: 'tour.full.exportMap.title', bodyKey: 'tour.full.exportMap.body' },
  { selector: '[data-tour="settings-button"]', titleKey: 'tour.full.settings.title', bodyKey: 'tour.full.settings.body' },
]

// Per-release deltas, keyed by major.minor. Patch releases reuse them.
const TOURS: Record<string, TourStepDef[]> = {
  '0.8': [
    { selector: '[data-tour="settings-button"]', titleKey: 'tour.v080.settings.title', bodyKey: 'tour.v080.settings.body' },
    { selector: '[data-tour="basemap-toggle"]', titleKey: 'tour.v080.basemap.title', bodyKey: 'tour.v080.basemap.body' },
    { selector: '[data-tour="halte-filter"]', titleKey: 'tour.v080.halteFilter.title', bodyKey: 'tour.v080.halteFilter.body' },
    { selector: '[data-tour="export-map"]', titleKey: 'tour.v080.exportMap.title', bodyKey: 'tour.v080.exportMap.body' },
  ],
}

function majorMinor(v: string): string {
  const [a, b] = v.split('.')
  return `${a}.${b}`
}

/** Below this many surviving steps a tour reads as one orphaned
 *  popover, not a walkthrough. App.vue gates launch to the city route;
 *  this is the backstop for any future tour/route mismatch. */
export const MIN_TOUR_STEPS = 2

export function isTourWorthShowing(stepCount: number): boolean {
  return stepCount >= MIN_TOUR_STEPS
}

/** Shared state read by TourCoach.vue. */
export const tourState = reactive<{ open: boolean; steps: TourStep[]; index: number }>({
  open: false,
  steps: [],
  index: 0,
})

/** First on-screen match. The same data-tour id can exist twice (desktop
 *  and mobile layouts), and the hidden copy has a zero-size box. */
export function visibleTarget(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

export function useTour() {
  const { t } = useI18n()

  function toSteps(def: TourStepDef[]): TourStep[] {
    return def
      .filter((s) => visibleTarget(s.selector))
      .map((s) => ({ selector: s.selector, title: t(s.titleKey), body: t(s.bodyKey) }))
  }

  function run(steps: TourStep[]) {
    if (!isTourWorthShowing(steps.length)) return
    tourState.steps = steps
    tourState.index = 0
    tourState.open = true
  }

  function close() {
    localStorage.setItem(SEEN_KEY, APP_VERSION)
    tourState.open = false
  }
  function next() {
    if (tourState.index >= tourState.steps.length - 1) close()
    else tourState.index++
  }
  function prev() {
    if (tourState.index > 0) tourState.index--
  }

  function start() {
    run(toSteps(TOURS[majorMinor(APP_VERSION)] ?? []))
  }
  function startFullTour() {
    run(toSteps(FULL_TOUR))
  }

  /** Boot helper, runs once after Vue mounts.
   *   - first visit ever: full onboarding
   *   - new release with a delta tour: release tour
   *   - already on current release: nothing */
  async function maybeStartForVersion() {
    const seen = localStorage.getItem(SEEN_KEY)
    if (seen && majorMinor(seen) === majorMinor(APP_VERSION)) return
    await nextTick()
    await new Promise((r) => setTimeout(r, 600))
    if (!seen) startFullTour()
    else start()
  }

  function reset() {
    localStorage.removeItem(SEEN_KEY)
  }

  return { start, startFullTour, maybeStartForVersion, reset, next, prev, close }
}
