<script setup lang="ts">
/**
 * Mobile "Route Detail" — vertical halte timeline with incoming
 * bus cards. Lives inside the existing CityView BottomSheet when
 * a corridor is focused (instead of the previous CorridorFocusPanel
 * on mobile).
 *
 * Mirrors the TJ Transjakarta "Route Details" screen — direction
 * tabs, then each halte node with its incoming buses stacked below.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useFocusStore } from '@/stores/focus'
import { useSelectionStore } from '@/stores/selection'
import { busLegProgress, etaToHalte, getEtaQuality, isStale, parseProgress } from '@/lib/format'
import HalteTimelineNode from '@/components/HalteTimelineNode.vue'
import IncomingBusCard from '@/components/IncomingBusCard.vue'
import CopyLinkButton from '@/components/CopyLinkButton.vue'
import EtaQualityGuide from '@/components/EtaQualityGuide.vue'
import type { BrtBus, BrtHalte } from '@/types/brt'

const { t } = useI18n()
const brt = useBrtStore()
const focus = useFocusStore()
const selection = useSelectionStore()
const { corridor, halte, direction, directionAvailable } = storeToRefs(focus)

function pickBus(bus: BrtBus) {
  selection.selectBus(bus.imei || bus.id)
}

const tick = ref(0)
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => (tick.value += 1), 15_000)
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

const accentColor = computed(() => corridor.value?.color || '#1D9CD4')

const activeBusCount = computed(() => {
  const c = corridor.value
  if (!c) return 0
  let n = 0
  for (const b of brt.buses.values()) if (b.kor === c.kor) n++
  return n
})

const halteCount = computed(() => halte.value.length)

interface IncomingBus {
  bus: BrtBus
  etaMin: number | null
  distM: number | null
  arrivalAt: string | null
  status: 'last' | 'approaching'
  stale: boolean
}
interface HalteRow {
  halte: BrtHalte
  incoming: IncomingBus[]
}

const rows = computed<HalteRow[]>(() => {
  void tick.value
  const c = corridor.value
  if (!c) return []
  const haltes = halte.value

  // See CorridorFocusPanel for the full rationale: include a bus when
  // its new_shel_t is in the focused halte list OR bus.toward matches
  // the focused leg's toward. The first clause rescues K2A reverse
  // buses whose upstream-toward stays pinned to the forward direction.
  const focusedToward = direction.value === 'a' ? c.toward : c.origin
  const idxBySh = new Map<string, number>()
  for (let i = 0; i < haltes.length; i++) idxBySh.set(haltes[i].sh_id, i)
  const buses = [...brt.buses.values()].filter((b) => {
    if (b.kor !== c.kor) return false
    if (b.new_shel_t && idxBySh.has(b.new_shel_t)) return true
    return b.toward === focusedToward
  })
  // Place by busLegProgress only — see CorridorFocusPanel for why we
  // no longer trust bus.new_shel_t as a direct index (premature jumps).
  const busToIdx = new Map<string, number>()
  for (const bus of buses) {
    if (!haltes.length) continue
    const idx = busLegProgress(bus, haltes)
    if (idx >= 0 && idx < haltes.length) {
      busToIdx.set(bus.imei || bus.id, idx)
    }
  }

  const out: HalteRow[] = []
  for (let i = 0; i < haltes.length; i++) {
    const h = haltes[i]
    const isTerminal = i === haltes.length - 1
    const incoming: IncomingBus[] = []
    for (const bus of buses) {
      if (busToIdx.get(bus.imei || bus.id) !== i) continue
      const eta = etaToHalte(bus, h)
      const etaMin = eta?.etaMin ?? null
      incoming.push({
        bus,
        etaMin,
        distM: eta?.distM ?? null,
        arrivalAt: etaMin != null ? formatArrivalAt(etaMin) : null,
        status: isTerminal ? 'last' : 'approaching',
        stale: isStale(bus),
      })
    }
    incoming.sort((a, b) => {
      if (a.etaMin == null && b.etaMin == null) return 0
      if (a.etaMin == null) return 1
      if (b.etaMin == null) return -1
      return a.etaMin - b.etaMin
    })
    out.push({ halte: h, incoming })
  }
  return out
})

function formatArrivalAt(etaMin: number): string {
  const t = new Date(Date.now() + Math.max(0, etaMin) * 60_000)
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`
}
function pad(n: number) {
  return n < 10 ? `0${n}` : String(n)
}
</script>

<template>
  <article v-if="corridor" class="flex flex-col gap-3">
    <!-- Sticky header — the BottomSheet's slot container is the
         scroll context. With sticky top-0 the corridor info +
         direction tabs stay visible at the top of the sheet while
         the halte timeline scrolls underneath.
         z-20 keeps us above the timeline track. The solid bg matches
         the sheet's surface so scrolling content never bleeds
         through, and the bottom shadow provides a subtle separator. -->
    <div class="sticky -top-1 z-20 -mx-4 flex flex-col gap-3 bg-bnc-paper px-4 pb-3 pt-2 shadow-[0_4px_8px_-6px_rgba(10,14,20,0.12)] dark:bg-bnc-stone-900">
    <header class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <button
          type="button"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
          :aria-label="t('a11y.back')"
          @click="focus.clear()"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <span
          class="grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-extrabold text-white"
          :style="{ background: accentColor }"
          aria-hidden
        >
          {{ corridor.kor }}
        </span>
        <div class="min-w-0">
          <p class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
            {{ t('route.detailTitle') }}
          </p>
          <h2 class="truncate font-display text-sm font-bold tracking-tight">
            {{ corridor.origin }} – {{ corridor.toward }}
          </h2>
        </div>
      </div>
      <CopyLinkButton />
    </header>

    <!-- summary chips: halte count + active bus count -->
    <div class="flex flex-wrap items-center gap-1.5">
      <span
        class="inline-flex items-center gap-1 rounded-full bg-bnc-stone-100 px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300"
      >
        <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
          <circle cx="12" cy="10" r="3" />
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        </svg>
        {{ halteCount }} halte
      </span>
      <span
        class="inline-flex items-center gap-1 rounded-full px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider"
        :class="
          activeBusCount > 0
            ? 'bg-bnc-accent/15 text-bnc-accent'
            : 'bg-bnc-stone-100 text-bnc-stone-500 dark:bg-bnc-stone-800'
        "
      >
        <span
          class="h-1.5 w-1.5 rounded-full"
          :style="{
            background: activeBusCount > 0 ? 'var(--color-bnc-accent)' : 'var(--color-stale)',
          }"
          aria-hidden
        />
        {{ activeBusCount }} {{ t('route.busActive') }}
      </span>
      <EtaQualityGuide />
    </div>

    <!-- direction tabs -->
    <div
      v-if="directionAvailable.a || directionAvailable.b"
      class="flex border-b border-bnc-stone-200 dark:border-bnc-stone-800"
    >
      <button
        v-if="directionAvailable.a"
        type="button"
        class="flex-1 truncate px-2 pb-1.5 pt-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
        :class="
          direction === 'a'
            ? 'border-b-2 border-bnc-primary text-bnc-primary dark:border-bnc-accent dark:text-bnc-accent'
            : 'text-bnc-stone-500 hover:text-bnc-stone-700 dark:hover:text-bnc-stone-200'
        "
        @click="focus.setDirection('a')"
      >
        {{ corridor.toward }}
      </button>
      <button
        v-if="directionAvailable.b"
        type="button"
        class="flex-1 truncate px-2 pb-1.5 pt-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
        :class="
          direction === 'b'
            ? 'border-b-2 border-bnc-primary text-bnc-primary dark:border-bnc-accent dark:text-bnc-accent'
            : 'text-bnc-stone-500 hover:text-bnc-stone-700 dark:hover:text-bnc-stone-200'
        "
        @click="focus.setDirection('b')"
      >
        {{ corridor.origin }}
      </button>
    </div>

    <p
      v-if="!directionAvailable.a || !directionAvailable.b"
      class="rounded-md bg-bnc-stone-100 px-2 py-1.5 text-[10px] text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300"
    >
      {{ t('route.oneWayOnly') }}
    </p>
    </div>

    <!-- timeline -->
    <ol class="flex flex-col">
      <HalteTimelineNode
        v-for="(r, idx) in rows"
        :key="r.halte.sh_id"
        :haltename="r.halte.sh_name"
        :halte-id="r.halte.sh_id"
        :accent-color="accentColor"
        :is-first="idx === 0"
        :is-last="idx === rows.length - 1"
        @halte-click="selection.selectHalte($event)"
      >
        <button
          v-for="ib in r.incoming"
          :key="ib.bus.imei || ib.bus.id"
          type="button"
          class="text-left transition-transform active:scale-[0.99]"
          @click="pickBus(ib.bus)"
        >
          <IncomingBusCard
            :kor="ib.bus.kor"
            :corridor-color="accentColor"
            :plate="ib.bus.plate_number ?? null"
            :armada="ib.bus.name ?? null"
            :eta-min="ib.etaMin"
            :dist-m="ib.distM"
            :progress-pct="parseProgress(ib.bus.prosen)"
            :arrival-at="ib.arrivalAt"
            :status="ib.status"
            :toward="r.halte.sh_name"
            :final-destination="ib.bus.toward ?? null"
            :speed-kmh="ib.bus.speed ?? null"
            :quality="getEtaQuality(ib.bus)"
            :stale="ib.stale"
          />
        </button>
      </HalteTimelineNode>

      <li
        v-if="!rows.length"
        class="rounded-md bg-bnc-stone-100 px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500 dark:bg-bnc-stone-800"
      >
        {{ t('route.noHalte') }}
      </li>
    </ol>
  </article>
</template>
