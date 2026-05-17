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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useFocusStore } from '@/stores/focus'
import { useSelectionStore } from '@/stores/selection'
import { getEtaQuality, parseProgress } from '@/lib/format'
import HalteTimelineNode from '@/components/HalteTimelineNode.vue'
import IncomingBusCard from '@/components/IncomingBusCard.vue'
import CopyLinkButton from '@/components/CopyLinkButton.vue'
import EtaQualityGuide from '@/components/EtaQualityGuide.vue'
import SheetStickyHeader from '@/components/SheetStickyHeader.vue'
import DirectionSelector from '@/components/DirectionSelector.vue'
import type { BrtBus, BrtHalte } from '@/types/brt'

const { t } = useI18n()
const brt = useBrtStore()
const focus = useFocusStore()
const selection = useSelectionStore()
const { corridor, halte, direction, directionAvailable } = storeToRefs(focus)

function pickBus(bus: BrtBus) {
  selection.selectBus(bus.imei || bus.id)
}

const accentColor = computed(() => corridor.value?.color || '#1D9CD4')

const activeBusCount = computed(() => {
  const c = corridor.value
  if (!c) return 0
  let n = 0
  for (const b of brt.buses.values()) if (b.kor === c.kor) n++
  return n
})

const halteCount = computed(() => halte.value.length)

const rows = brt.corridorTimelineRowsFor(() => corridor.value?.kor, () => direction.value)

function corridorBadgesFor(h: BrtHalte) {
  return brt.corridorBadgesForHalte(h, corridor.value?.kor ?? null)
}
</script>

<template>
  <article v-if="corridor" class="flex flex-col gap-3">
    <SheetStickyHeader :back-label="t('a11y.back')" @back="focus.clear()">
      <div class="flex min-w-0 flex-1 items-center gap-2">
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
      <template #belowTitle>
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
        <DirectionSelector
          layout="mobile"
          :direction="direction"
          :available="directionAvailable"
          :toward-label="corridor.toward"
          :origin-label="corridor.origin"
          @update:direction="focus.setDirection($event)"
        />
      </template>
    </SheetStickyHeader>

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
        :corridor-badges="corridorBadgesFor(r.halte)"
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
