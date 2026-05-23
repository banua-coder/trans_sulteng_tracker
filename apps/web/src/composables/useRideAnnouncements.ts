/**
 * Voice cues for trip companion mode. Watches the ride store's
 * status + step index + distance-to-target and fires bilingual
 * announcements via useAnnouncer.
 *
 * Dedup model: a Set keyed by `${stepIdx}:${marker}` so each
 * threshold crossing only announces once per step. The set resets
 * whenever the ride exits idle (new trip starts) so the same plan
 * can be played twice cleanly.
 */
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useRideStore } from '@/stores/ride'
import { useAnnouncer } from '@/composables/useAnnouncer'

const BOARDING_NEAR_M = 100
const TRANSFER_NEAR_M = 200
const DESTINATION_NEAR_M = 150

export function useRideAnnouncements() {
  const ride = useRideStore()
  const { state, status, currentStep, distanceToTargetM, isStale } = storeToRefs(ride)
  const announcer = useAnnouncer()
  const { t } = useI18n()

  let fired = new Set<string>()
  let prevStatus = state.value.status

  function key(marker: string): string {
    return `${state.value.stepIdx}:${marker}`
  }
  function once(marker: string, fire: () => void) {
    const k = key(marker)
    if (fired.has(k)) return
    fired.add(k)
    fire()
  }

  // Reset dedup when a new ride starts (idle → anything else).
  watch(status, (next, prev) => {
    if (prev === 'idle' && next !== 'idle') {
      fired = new Set()
    }
    prevStatus = prev
  })

  // Status-driven cues.
  watch(
    () => state.value.status,
    (s) => {
      if (s === 'walking' && state.value.stepIdx === 0) {
        const step = currentStep.value
        if (step) {
          once('start', () =>
            announcer.announce({
              text: {
                id: t('ride.cues.start', { halte: step.toName, m: Math.round(step.distM) }),
                en: t('ride.cues.start', { halte: step.toName, m: Math.round(step.distM) }),
              },
              chime: 'arrival',
            }),
          )
        }
      }

      if (s === 'on-bus' && prevStatus === 'waiting') {
        const step = currentStep.value
        if (step?.kind === 'ride') {
          once('boarded', () =>
            announcer.announce({
              text: {
                id: t('ride.cues.boarded', {
                  kor: step.kor ?? '',
                  next: step.toName,
                }),
                en: t('ride.cues.boarded', {
                  kor: step.kor ?? '',
                  next: step.toName,
                }),
              },
              chime: 'arrival',
            }),
          )
        }
      }

      if (s === 'arrived') {
        const start = state.value.startedAt
        const end = state.value.endedAt ?? Date.now()
        const min = Math.max(1, Math.round((end - start!) / 60_000))
        const dest = state.value.plan?.steps.at(-1)?.toName ?? '—'
        once('arrived', () =>
          announcer.announce({
            text: {
              id: t('ride.cues.arrived', { destination: dest, min }),
              en: t('ride.cues.arrived', { destination: dest, min }),
            },
            chime: 'arrival',
          }),
        )
      }
    },
  )

  // Proximity cues — derived from distanceToTargetM.
  const remainingSteps = computed(() => {
    if (!state.value.plan) return 0
    return state.value.plan.steps.length - state.value.stepIdx - 1
  })

  watch(
    () => [state.value.status, distanceToTargetM.value] as const,
    ([s, dist]) => {
      if (dist == null) return
      if (isStale.value) return

      // Approaching boarding halte during initial walk.
      if (s === 'walking' && state.value.stepIdx === 0) {
        if (dist <= BOARDING_NEAR_M) {
          // Boarding halte is the destination of the walk step, which
          // is the same name as the next ride step's fromName.
          const next = state.value.plan?.steps[state.value.stepIdx + 1]
          if (next?.kind === 'ride') {
            once('boardingNear', () =>
              announcer.announce({
                text: {
                  id: t('ride.cues.boardingNearNoEta', {
                    halte: next.fromName,
                    kor: next.kor ?? '',
                  }),
                  en: t('ride.cues.boardingNearNoEta', {
                    halte: next.fromName,
                    kor: next.kor ?? '',
                  }),
                },
                chime: 'arrival',
              }),
            )
          }
        }
      }

      // On-bus approach: transfer if more legs remain, otherwise destination.
      if (s === 'on-bus') {
        const step = currentStep.value
        if (!step || step.kind !== 'ride') return
        const isFinalRide = remainingSteps.value <= 1
        if (isFinalRide) {
          if (dist <= DESTINATION_NEAR_M) {
            once('destinationNear', () =>
              announcer.announce({
                text: {
                  id: t('ride.cues.destinationNear'),
                  en: t('ride.cues.destinationNear'),
                },
                chime: 'arrival',
              }),
            )
          }
        } else if (dist <= TRANSFER_NEAR_M) {
          // Next-next step is the next ride (transfer step usually
          // sits between two rides).
          const nextRide = state.value.plan?.steps
            .slice(state.value.stepIdx + 1)
            .find((sx) => sx.kind === 'ride')
          once('transferNear', () =>
            announcer.announce({
              text: {
                id: t('ride.cues.transferNear', {
                  halte: step.toName,
                  next: nextRide?.kor ?? '',
                }),
                en: t('ride.cues.transferNear', {
                  halte: step.toName,
                  next: nextRide?.kor ?? '',
                }),
              },
              chime: 'arrival',
            }),
          )
        }
      }
    },
  )
}
