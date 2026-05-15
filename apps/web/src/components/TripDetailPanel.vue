<script setup lang="ts">
/**
 * Trip detail — full itinerary view shown after the user taps a
 * TripResultCard. Uses the same sticky-header pattern as
 * MobileRouteDetailPanel so the back button + summary chips stay
 * visible while the step timeline scrolls.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useTripStore } from '@/stores/trip'
import { useBrtStore } from '@/stores/brt'
import { useSelectionStore } from '@/stores/selection'
import { busLegProgress, etaToHalte, getEtaQuality, haversineMeters, isStale } from '@/lib/format'
import CopyLinkButton from '@/components/CopyLinkButton.vue'
import PlateBadge from '@/components/PlateBadge.vue'
import type { PlanStep } from '@/lib/tripPlanner'
import type { BrtBus } from '@/types/brt'

const { t } = useI18n()
const trip = useTripStore()
const brt = useBrtStore()
const selection = useSelectionStore()
const { selectedPlan, origin, destination } = storeToRefs(trip)

// Tick every 30 s so wall-clock ETAs stay fresh while the panel is
// open. Cheap because the templates only read tick to invalidate the
// upcoming-buses computeds; nothing redraws unconditionally.
const tick = ref(0)
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => { tick.value += 1 }, 30_000)
})
onBeforeUnmount(() => { if (timer) window.clearInterval(timer) })

// Expansion state for the "Buses to {halte}" disclosures under each
// ride step. Key = step index. Collapsed by default; the user opts
// in per step so we don't slam the screen with bus lists for plans
// with three or four transfers.
const expanded = reactive<Record<number, boolean>>({})
function toggleExpand(idx: number) {
  expanded[idx] = !expanded[idx]
}

// Plan changes (different route picked, swap, etc.) reset the toggles
// so the new plan opens cleanly.
watch(selectedPlan, () => {
  for (const k of Object.keys(expanded)) delete expanded[k as unknown as number]
})

// Eagerly fetch per-leg halte for each ride step's corridor in BOTH
// directions. The boarding halte's sh_id might live only on the
// per-leg feed (terminus halte are missing from the bulk feed for
// some corridors); without these fetches the busLegProgress lookup
// would silently miss and the disclosure would always read empty.
watch(
  selectedPlan,
  (plan) => {
    if (!plan) return
    const seen = new Set<string>()
    for (const step of plan.steps) {
      if (step.kind !== 'ride' || !step.kor) continue
      if (seen.has(step.kor)) continue
      seen.add(step.kor)
      const c = brt.corridorByKor.get(step.kor)
      if (!c) continue
      brt.ensureHalteForLeg(step.kor, c.toward, c.origin).catch(() => {})
      brt.ensureHalteForLeg(step.kor, c.origin, c.toward).catch(() => {})
    }
  },
  { immediate: true },
)

interface UpcomingBus {
  bus: BrtBus
  etaMin: number | null
  distM: number | null
  atStop: boolean
  fresh: boolean
  quality: 'good' | 'warn' | 'stale'
  corridorColor: string
  arrivalAt: string | null
}

function pad(n: number): string { return n < 10 ? `0${n}` : String(n) }
function wallClock(etaMin: number): string {
  const d = new Date(Date.now() + Math.max(0, etaMin) * 60_000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const AT_STOP_RADIUS_M = 80

/** Build the list of buses on `kor` currently heading to the halte
 *  named `boardingName`. Same shape as HalteDetailCard.arrivals but
 *  scoped to a single corridor + halte so each disclosure stays
 *  focused on the leg the user is actually planning to board. */
function upcomingBusesForStep(boardingName: string, kor: string | undefined): UpcomingBus[] {
  void tick.value // re-evaluate every 30 s for wall-clock ETAs
  if (!kor) return []
  const corridor = brt.corridorByKor.get(kor)
  if (!corridor) return []

  // Every sh_id that shares this halte's name on the boarding
  // corridor — covers the multi-row case where bulk + per-leg list
  // the same physical stop under different ids per direction.
  const boardingShIds = new Set(
    brt.halte
      .filter((h) => h.kor === kor && h.sh_name === boardingName)
      .map((h) => h.sh_id),
  )

  // Coords for nearby-check + haversine ETA. Pick any matching halte
  // record — the duplicates share lat/lng within GPS jitter.
  let boardingCoord: { lat: number; lng: number } | null = null
  const h = brt.halte.find((x) => x.kor === kor && x.sh_name === boardingName)
  if (h) {
    const lat = parseFloat(h.sh_lat)
    const lng = parseFloat(h.sh_lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      boardingCoord = { lat, lng }
    }
  }

  const out: UpcomingBus[] = []
  const seen = new Set<string>()
  for (const bus of brt.buses.values()) {
    if (bus.kor !== kor) continue

    // Will this bus's upcoming-stop path pass `boardingName`?
    let headingHere = false
    const originName = bus.toward === corridor.toward ? corridor.origin : corridor.toward
    const leg = brt.getHalteForLeg(kor, bus.toward, originName)
    if (leg.length) {
      const progressIdx = busLegProgress(bus, leg)
      for (let i = progressIdx; i < leg.length; i++) {
        if (leg[i].sh_name === boardingName) { headingHere = true; break }
      }
    }
    // Fallback while per-leg data is still loading.
    if (!headingHere && bus.new_shel_t && boardingShIds.has(bus.new_shel_t)) {
      headingHere = true
    }

    let nearby = false
    if (boardingCoord && Number.isFinite(bus.lat) && Number.isFinite(bus.lng)) {
      const d = haversineMeters(boardingCoord, { lat: Number(bus.lat), lng: Number(bus.lng) })
      nearby = d <= AT_STOP_RADIUS_M
    }
    if (!headingHere && !nearby) continue
    const key = bus.imei || bus.id
    if (seen.has(key)) continue
    seen.add(key)

    let etaMin: number | null = null
    let distM: number | null = null
    if (!nearby && boardingCoord
        && Number.isFinite(bus.lat) && Number.isFinite(bus.lng)) {
      // dist_shel on the wire applies to the bus's new_shel_t halte
      // — irrelevant when we're asking about a specific boarding
      // halte that may be several stops ahead. Force the haversine
      // fallback so the ETA reflects bus → boarding directly.
      const eta = etaToHalte(
        { lat: Number(bus.lat), lng: Number(bus.lng), speed: bus.speed, dist_shel: null },
        { sh_lat: boardingCoord.lat, sh_lng: boardingCoord.lng },
      )
      distM = eta?.distM ?? null
      etaMin = eta?.etaMin ?? null
    }

    out.push({
      bus,
      etaMin: nearby ? 0 : etaMin,
      distM: nearby ? 0 : distM,
      atStop: nearby,
      fresh: !isStale(bus),
      quality: getEtaQuality(bus),
      corridorColor: brt.colorForKor(kor) || '#0EA5E9',
      arrivalAt: !nearby && etaMin != null ? wallClock(etaMin) : null,
    })
  }

  out.sort((a, b) => {
    if (a.atStop !== b.atStop) return a.atStop ? -1 : 1
    if (a.etaMin == null && b.etaMin == null) return 0
    if (a.etaMin == null) return 1
    if (b.etaMin == null) return -1
    return a.etaMin - b.etaMin
  })
  return out
}

function back() {
  trip.selectPlan(null)
}

function colorForStep(step: PlanStep): string {
  if (step.kind === 'ride' && step.kor) return brt.colorForKor(step.kor) || 'var(--color-bnc-accent)'
  if (step.kind === 'transfer') return 'var(--color-warn)'
  return 'var(--color-bnc-stone-400)'
}

const totalKm = computed(() => {
  if (!selectedPlan.value) return 0
  return (selectedPlan.value.totalWalkM + selectedPlan.value.totalRideM) / 1000
})

/** Number each unique boarding/alighting halte in encounter order —
 *  exactly the same dedupe rule MapView's drawTripPreview uses, so
 *  the number shown in the timeline matches the red disc on the map.
 *  Returns a map: step index → assigned number (or null if the step
 *  isn't tied to a numbered point). */
const stepNumbers = computed(() => {
  const out = new Map<number, number>()
  if (!selectedPlan.value) return out
  const seen = new Map<string, number>()
  let counter = 1
  // First pass: assign numbers to every distinct boarding/alighting
  // halte name (only ride steps drive numbering — walk legs to the
  // destination don't get a numbered map marker).
  for (const step of selectedPlan.value.steps) {
    if (step.kind !== 'ride') continue
    if (!seen.has(step.fromName)) seen.set(step.fromName, counter++)
    if (!seen.has(step.toName)) seen.set(step.toName, counter++)
  }
  // Second pass: rides + walks get the number of their arrival
  // halte. Transfer steps deliberately stay un-numbered — the
  // transfer point's disc already lives on the surrounding ride
  // rows (alighting of the previous ride / boarding of the next),
  // so giving the transfer row its own number drew a duplicate.
  for (let i = 0; i < selectedPlan.value.steps.length; i++) {
    const step = selectedPlan.value.steps[i]
    if (step.kind === 'ride') {
      const n = seen.get(step.toName)
      if (n != null) out.set(i, n)
    } else if (step.kind === 'walk') {
      const n = seen.get(step.toName)
      if (n != null) out.set(i, n)
    }
  }
  return out
})

function coordForName(name: string, kor: string | undefined): { lat: number; lng: number } | null {
  const h = (kor && brt.halte.find((x) => x.sh_name === name && x.kor === kor))
    ?? brt.halte.find((x) => x.sh_name === name)
  if (!h) return null
  const lat = parseFloat(h.sh_lat)
  const lng = parseFloat(h.sh_lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function focusStep(step: PlanStep) {
  // For rides, zoom to alighting (the destination of that segment).
  // For transfers, zoom to the transfer point itself. For walk-out
  // (toName === destination's label), zoom to the destination pin.
  if (step.kind === 'walk' && step.toName === destination.value?.label) {
    if (destination.value?.point) trip.focusStop(destination.value.point)
    return
  }
  const name = step.kind === 'transfer' ? step.fromName : step.toName
  const c = coordForName(name, step.kor)
  if (c) trip.focusStop(c)
}
</script>

<template>
  <article
    v-if="selectedPlan"
    class="pointer-events-auto flex w-full flex-col gap-3 sm:max-w-sm lg:max-w-md lg:rounded-[var(--radius-md)] lg:border lg:border-bnc-stone-200 lg:bg-white lg:p-4 lg:shadow-[var(--shadow-elevated)] dark:lg:border-bnc-stone-800 dark:lg:bg-bnc-stone-900"
  >
    <!-- Sticky header on mobile -->
    <div
      class="sticky -top-1 z-20 -mx-4 flex flex-col gap-2 bg-bnc-paper px-4 pb-3 pt-2 shadow-[0_4px_8px_-6px_rgba(10,14,20,0.12)] dark:bg-bnc-stone-900 lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:shadow-none dark:lg:bg-transparent"
    >
      <header class="flex items-center gap-2">
        <button
          type="button"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
          :aria-label="t('a11y.back')"
          @click="back"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div class="min-w-0 flex-1">
          <p class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
            {{ t('trip.itineraryTitle') }}
          </p>
          <h2 class="truncate font-display text-sm font-bold tracking-tight">
            {{ origin?.label ?? '—' }} → {{ destination?.label ?? '—' }}
          </h2>
        </div>
        <CopyLinkButton />
      </header>

      <!-- summary chips -->
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="inline-flex items-center gap-1 rounded-full bg-bnc-stone-100 px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300">
          <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          {{ Math.round(selectedPlan.totalMin) }} {{ t('units.minutes') }}
        </span>
        <span class="inline-flex items-center gap-1 rounded-full bg-bnc-stone-100 px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300">
          {{ totalKm.toFixed(1) }} km
        </span>
      </div>
    </div>

    <!-- Step timeline -->
    <ol class="flex flex-col">
      <li
        v-for="(step, idx) in selectedPlan.steps"
        :key="idx"
        class="group relative flex cursor-pointer gap-3 pb-3 transition-colors hover:bg-bnc-stone-100/50 dark:hover:bg-bnc-stone-800/30"
        @click="focusStep(step)"
      >
        <!-- Rail + node dot. When this step has a numbered waypoint
             on the map, render the number inside the dot so the user
             can correlate timeline ↔ map marker at a glance. -->
        <div class="relative flex w-6 shrink-0 flex-col items-center">
          <span
            v-if="stepNumbers.get(idx) != null"
            class="z-10 grid h-5 w-5 place-items-center rounded-full border-2 border-white font-mono text-[10px] font-bold tabular-nums text-white shadow-sm dark:border-bnc-stone-900"
            :style="{ background: colorForStep(step) }"
          >
            {{ stepNumbers.get(idx) }}
          </span>
          <span
            v-else
            class="z-10 h-3 w-3 rounded-full border-2 border-white dark:border-bnc-stone-900"
            :style="{ background: colorForStep(step) }"
            aria-hidden
          />
          <!-- vertical connector line, hidden on last -->
          <span
            v-if="idx < selectedPlan.steps.length - 1"
            class="absolute left-1/2 top-5 h-full w-0.5 -translate-x-1/2"
            :style="{ background: step.kind === 'walk' ? 'transparent' : colorForStep(step) }"
            aria-hidden
          >
            <!-- For walk steps render a dashed line via repeating gradient -->
            <span
              v-if="step.kind === 'walk'"
              class="absolute inset-0 bg-[length:2px_6px] bg-[repeating-linear-gradient(to_bottom,var(--color-bnc-stone-400)_0_2px,transparent_2px_6px)]"
              aria-hidden
            />
          </span>
        </div>

        <!-- Step body -->
        <div class="min-w-0 flex-1">
          <!-- Walk -->
          <template v-if="step.kind === 'walk'">
            <p class="flex items-center gap-1.5 text-sm font-medium">
              <svg class="h-3.5 w-3.5 text-bnc-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
                <circle cx="13" cy="4" r="2" />
                <path d="M9 21l2-6 3-3-2-4-3 3-3 0M14 21l2-7 4-3" />
              </svg>
              {{ t('trip.walkTo') }} {{ step.toName }}
            </p>
            <p class="mt-0.5 font-mono text-[10px] tabular-nums text-bnc-stone-500">
              {{ Math.max(1, Math.round(step.durationMin)) }} {{ t('units.minutes') }}
              <template v-if="step.distM"> · {{ (step.distM / 1000).toFixed(2) }} km</template>
            </p>
          </template>

          <!-- Ride -->
          <template v-else-if="step.kind === 'ride'">
            <p class="flex flex-wrap items-center gap-1.5 text-sm font-medium">
              <span
                class="inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
                :style="{ background: colorForStep(step) }"
              >
                {{ step.kor }}
              </span>
              <span class="truncate">{{ step.fromName }} → {{ step.toName }}</span>
            </p>
            <p class="mt-0.5 font-mono text-[10px] tabular-nums text-bnc-stone-500">
              {{ Math.max(1, Math.round(step.durationMin)) }} {{ t('units.minutes') }}
              <template v-if="step.distM"> · {{ (step.distM / 1000).toFixed(2) }} km</template>
            </p>

            <!-- Boarding-halte arrival peek. Collapsed by default so a
                 four-leg plan doesn't spam four bus lists; tap to open.
                 The button is stopPropagation'd because the timeline row
                 itself is a click target that flies the map to this leg.
                 We don't want toggling the disclosure to also fly. -->
            <button
              type="button"
              class="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
              :aria-expanded="!!expanded[idx]"
              :aria-controls="`trip-step-buses-${idx}`"
              @click.stop="toggleExpand(idx)"
            >
              <svg
                class="h-3 w-3 transition-transform"
                :class="expanded[idx] ? 'rotate-180' : ''"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
              {{ t('trip.upcomingBusesAt', { halte: step.fromName }) }}
              <span
                v-if="upcomingBusesForStep(step.fromName, step.kor).length"
                class="ml-0.5 rounded-full bg-bnc-stone-200 px-1.5 py-[1px] font-mono text-[9px] tabular-nums text-bnc-stone-700 dark:bg-bnc-stone-700 dark:text-bnc-stone-200"
              >
                {{ upcomingBusesForStep(step.fromName, step.kor).length }}
              </span>
            </button>

            <ul
              v-if="expanded[idx]"
              :id="`trip-step-buses-${idx}`"
              class="mt-1.5 flex flex-col gap-1"
            >
              <li
                v-for="b in upcomingBusesForStep(step.fromName, step.kor)"
                :key="b.bus.imei || b.bus.id"
              >
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded-md border border-bnc-stone-200 bg-bnc-stone-50 px-2 py-1.5 text-left transition-colors hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-800/50 dark:hover:border-bnc-stone-700"
                  @click.stop="selection.selectBus(b.bus.imei || b.bus.id)"
                >
                  <span
                    class="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white"
                    :style="{ background: b.corridorColor }"
                  >
                    {{ b.bus.kor }}
                  </span>
                  <div class="flex min-w-0 flex-col">
                    <div class="flex items-center gap-1">
                      <PlateBadge
                        v-if="b.bus.plate_number"
                        :plate="b.bus.plate_number"
                        size="sm"
                      />
                      <span
                        v-else
                        class="truncate font-mono text-[11px] font-bold"
                      >
                        {{ b.bus.kor }}
                      </span>
                      <span
                        v-if="b.atStop"
                        class="rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white"
                        :style="{ background: 'var(--color-good)' }"
                      >
                        {{ t('halte.atStop') }}
                      </span>
                    </div>
                    <p
                      v-if="!b.fresh || b.distM != null"
                      class="mt-0.5 font-mono text-[9px] tabular-nums text-bnc-stone-500"
                    >
                      <template v-if="b.distM != null">
                        {{ Math.round(b.distM) }} m
                      </template>
                      <template v-if="!b.fresh">
                        <span v-if="b.distM != null"> · </span>
                        <span class="uppercase">stale</span>
                      </template>
                    </p>
                  </div>
                  <span class="ml-auto flex flex-col items-end">
                    <span
                      class="font-mono text-xs font-bold tabular-nums"
                      :style="{ color: `var(--color-${b.quality})` }"
                    >
                      <template v-if="b.etaMin != null">
                        ~{{ Math.max(1, Math.round(b.etaMin)) }}{{ t('units.minutes') }}
                      </template>
                      <template v-else>—</template>
                    </span>
                    <span
                      v-if="b.arrivalAt"
                      class="font-mono text-[9px] tabular-nums text-bnc-stone-500"
                    >
                      {{ b.arrivalAt }}
                    </span>
                  </span>
                </button>
              </li>
              <li
                v-if="!upcomingBusesForStep(step.fromName, step.kor).length"
                class="rounded-md bg-bnc-stone-100 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300"
              >
                {{ t('trip.upcomingBusesNone') }}
              </li>
            </ul>
          </template>

          <!-- Transfer -->
          <template v-else>
            <p class="flex items-center gap-1.5 text-sm font-medium">
              <svg class="h-3.5 w-3.5" :style="{ color: 'var(--color-warn)' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
                <path d="M17 3l4 4-4 4" />
                <path d="M3 7h18" />
                <path d="M7 21l-4-4 4-4" />
                <path d="M21 17H3" />
              </svg>
              {{ t('trip.transfer') }}
            </p>
            <p class="mt-0.5 font-mono text-[10px] tabular-nums text-bnc-stone-500">
              ≈ {{ Math.round(step.durationMin) }} {{ t('units.minutes') }}
            </p>
          </template>
        </div>
      </li>
    </ol>
  </article>
</template>
