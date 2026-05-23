/**
 * Voice announcements while viewing one bus. Watches the bus's
 * upcoming-stops list and fires on three transitions:
 *
 *  - Approach: head of upcomingStops gets ETA <= APPROACH_MIN
 *  - Arrival : the head's atStop flag flips false → true
 *  - Departure: the head moves on (sh_id at index 0 changed) AND the
 *               previous head was atStop. We announce that previous
 *               halte as departed, plus the new head as next.
 *
 * State scoped to the selected bus imei; reset when the user picks
 * a different bus.
 */
import { watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { BrtBus } from '@/types/brt'
import type { UpcomingStop } from '@/stores/brt'
import { useAnnouncer } from '@/composables/useAnnouncer'

const APPROACH_MIN = 2

interface Snapshot {
  busKey: string
  headShId: string
  headName: string
  headAtStop: boolean
  approached: boolean
}

export function useBusAnnouncements(
  selectedBus: Ref<BrtBus | null> | ComputedRef<BrtBus | null>,
  upcoming: Ref<UpcomingStop[]> | ComputedRef<UpcomingStop[]>,
) {
  const announcer = useAnnouncer()
  let last: Snapshot | null = null

  function busLabel(b: BrtBus): string {
    const kor = b.kor || ''
    const plate = b.plate_number ? `, ${b.plate_number}` : ''
    return `${kor}${plate}`.trim()
  }

  function announceApproach(b: BrtBus, stop: UpcomingStop) {
    const bus = busLabel(b)
    const eta = stop.etaMin != null ? Math.max(1, Math.round(stop.etaMin)) : null
    announcer.announce({
      text: {
        id: eta != null
          ? `Bus ${bus} mendekati halte ${stop.sh_name}, sekitar ${eta} menit lagi.`
          : `Bus ${bus} mendekati halte ${stop.sh_name}.`,
        en: eta != null
          ? `Bus ${bus} approaching ${stop.sh_name}, about ${eta} minute${eta === 1 ? '' : 's'}.`
          : `Bus ${bus} approaching ${stop.sh_name}.`,
      },
      chime: 'arrival',
    })
  }

  function announceArrival(b: BrtBus, stop: UpcomingStop) {
    const bus = busLabel(b)
    announcer.announce({
      text: {
        id: `Bus ${bus} telah tiba di halte ${stop.sh_name}.`,
        en: `Bus ${bus} has arrived at ${stop.sh_name}.`,
      },
      chime: 'arrival',
    })
  }

  function announceDeparture(b: BrtBus, from: string, toName: string | null) {
    const bus = busLabel(b)
    const next = toName ? ` Halte berikutnya: ${toName}.` : ''
    const nextEn = toName ? ` Next stop: ${toName}.` : ''
    announcer.announce({
      text: {
        id: `Bus ${bus} berangkat dari halte ${from}.${next}`,
        en: `Bus ${bus} departed from ${from}.${nextEn}`,
      },
      chime: 'arrival',
    })
  }

  watch(
    [selectedBus, upcoming],
    ([bus, stops]) => {
      if (!bus || !stops.length) {
        last = null
        return
      }
      const busKey = bus.imei || bus.id
      const head = stops[0]
      if (!head) return

      // Reset when the selected bus changes.
      if (!last || last.busKey !== busKey) {
        last = {
          busKey,
          headShId: head.sh_id,
          headName: head.sh_name,
          headAtStop: head.atStop,
          approached: false,
        }
        return
      }

      // Departure: head changed AND previous head was at-stop.
      if (last.headShId !== head.sh_id) {
        if (last.headAtStop) {
          announceDeparture(bus, last.headName, head.sh_name)
        }
        last = {
          busKey,
          headShId: head.sh_id,
          headName: head.sh_name,
          headAtStop: head.atStop,
          approached: false,
        }
        return
      }

      // Arrival: same head, atStop flipped on.
      if (!last.headAtStop && head.atStop) {
        announceArrival(bus, head)
        last.headAtStop = true
        return
      }

      // Approach: ETA dropped under the threshold, hasn't announced
      // approach for this head yet.
      if (
        !last.approached
        && !head.atStop
        && head.etaMin != null
        && head.etaMin <= APPROACH_MIN
      ) {
        announceApproach(bus, head)
        last.approached = true
      }
    },
    { deep: true, flush: 'post' },
  )
}
