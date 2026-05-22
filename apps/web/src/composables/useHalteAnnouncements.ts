/**
 * Fires voice announcements when buses approach or arrive at the
 * currently-viewed halte. Per-bus state machine: each (bus, halte)
 * pair announces at most once for each transition into 'approaching'
 * (ETA <= APPROACH_MIN minutes) and once into 'at-stop'. State is
 * keyed by bus imei + halte sh_id, so switching haltes resets the
 * tracker.
 */
import { watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { BrtHalte } from '@/types/brt'
import type { IncomingBus } from '@/stores/brt'
import { useAnnouncer } from '@/composables/useAnnouncer'

type State = 'far' | 'approaching' | 'at-stop'
const APPROACH_MIN = 2

export function useHalteAnnouncements(
  selectedHalte: Ref<BrtHalte | null> | ComputedRef<BrtHalte | null>,
  arrivals: Ref<IncomingBus[]> | ComputedRef<IncomingBus[]>,
) {
  const announcer = useAnnouncer()
  // bus imei → last announced state for THIS halte
  let lastState = new Map<string, State>()
  let lastHalteId: string | null = null

  function busLabel(a: IncomingBus): string {
    const kor = a.bus.kor || ''
    const plate = a.bus.plate_number ? `, ${a.bus.plate_number}` : ''
    return `${kor}${plate}`.trim()
  }

  function announceApproach(a: IncomingBus, halte: BrtHalte) {
    const eta = a.etaMin != null ? Math.max(1, Math.round(a.etaMin)) : null
    const bus = busLabel(a)
    const name = halte.sh_name
    announcer.announce({
      text: {
        id: eta != null
          ? `Bus ${bus} menuju halte ${name}, sekitar ${eta} menit lagi.`
          : `Bus ${bus} menuju halte ${name}.`,
        en: eta != null
          ? `Bus ${bus} approaching ${name}, about ${eta} minute${eta === 1 ? '' : 's'}.`
          : `Bus ${bus} approaching ${name}.`,
      },
      chime: 'arrival',
    })
  }

  function announceAtStop(a: IncomingBus, halte: BrtHalte) {
    const bus = busLabel(a)
    const name = halte.sh_name
    announcer.announce({
      text: {
        id: `Bus ${bus} telah tiba di halte ${name}.`,
        en: `Bus ${bus} has arrived at ${name}.`,
      },
      chime: 'arrival',
    })
  }

  watch(
    [selectedHalte, arrivals],
    ([halte, list]) => {
      // Reset tracker when the halte changes — announcements made for
      // the previous halte don't carry over.
      if (!halte) {
        lastState = new Map()
        lastHalteId = null
        return
      }
      if (lastHalteId !== halte.sh_id) {
        lastState = new Map()
        lastHalteId = halte.sh_id
      }

      for (const a of list) {
        const key = a.bus.imei || a.bus.id
        if (!key) continue
        const prev = lastState.get(key) ?? 'far'
        let next: State = 'far'
        if (a.atStop) next = 'at-stop'
        else if (a.etaMin != null && a.etaMin <= APPROACH_MIN) next = 'approaching'

        if (next === prev) continue

        // Only fire on forward transitions to avoid yo-yo when a stale
        // bus oscillates around the threshold. Backward transitions
        // (e.g. atStop → approaching) just update state silently.
        if (prev === 'far' && next === 'approaching') {
          announceApproach(a, halte)
        } else if (next === 'at-stop' && prev !== 'at-stop') {
          announceAtStop(a, halte)
        }
        lastState.set(key, next)
      }
    },
    { deep: true, flush: 'post' },
  )
}
