<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useFocusStore } from '@/stores/focus'
import { useSelectionStore } from '@/stores/selection'
import { getEtaQuality, parseProgress } from '@/lib/format'
import CopyLinkButton from '@/components/CopyLinkButton.vue'
import HalteTimelineNode from '@/components/HalteTimelineNode.vue'
import IncomingBusCard from '@/components/IncomingBusCard.vue'
import DirectionSelector from '@/components/DirectionSelector.vue'
import type { BrtBus, BrtHalte } from '@/types/brt'

const brt = useBrtStore()
const focus = useFocusStore()
const selection = useSelectionStore()
const { corridor, direction, directionAvailable } = storeToRefs(focus)

const rows = brt.corridorTimelineRowsFor(() => corridor.value?.kor, () => direction.value)

const activeBuses = computed(() => {
  const c = corridor.value
  if (!c) return [] as BrtBus[]
  return [...brt.buses.values()].filter((b) => b.kor === c.kor)
})

const accentColor = computed(() => corridor.value?.color || '#1D9CD4')

function corridorBadgesFor(h: BrtHalte) {
  return brt.corridorBadgesForHalte(h, corridor.value?.kor ?? null)
}

const directionLabel = computed(() => {
  const c = corridor.value
  if (!c) return ''
  return direction.value === 'a'
    ? `${c.origin} → ${c.toward}`
    : `${c.toward} → ${c.origin}`
})

function pickBus(bus: BrtBus) {
  selection.selectBus(bus.imei || bus.id)
}
</script>

<template>
  <transition name="slide-up">
    <aside
      v-if="focus.isFocused"
      class="pointer-events-auto flex max-h-[60dvh] w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-md)] border border-bnc-stone-200 bg-white shadow-[var(--shadow-elevated)] dark:border-bnc-stone-800 dark:bg-bnc-stone-900"
      role="dialog"
      :aria-label="'Koridor ' + (corridor?.kor ?? '')"
    >
      <header
        class="flex items-start gap-3 border-b border-bnc-stone-200 p-4 dark:border-bnc-stone-800"
      >
        <span
          class="grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-xs font-bold text-white"
          :style="{ background: accentColor }"
          aria-hidden
        >
          {{ corridor?.kor ?? '·' }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500">
            Koridor {{ corridor?.kor }} · {{ corridor?.jam_operasional || '—' }}
          </p>
          <h3 class="font-display text-base font-semibold leading-tight tracking-tight">
            {{ directionLabel }}
          </h3>
          <p class="mt-0.5 font-mono text-[11px] text-bnc-stone-500">
            {{ rows.length }} halte · {{ activeBuses.length }} bus aktif
          </p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            class="rounded-full p-1 text-bnc-stone-500 transition-colors hover:bg-bnc-stone-100 hover:text-bnc-ink dark:hover:bg-bnc-stone-800 dark:hover:text-bnc-paper"
            aria-label="Tutup fokus koridor"
            @click="focus.clear()"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
          <CopyLinkButton />
        </div>
      </header>

      <DirectionSelector
        layout="desktop"
        :direction="direction"
        :available="directionAvailable"
        :toward-label="corridor?.toward || ''"
        :origin-label="corridor?.origin || ''"
        @update:direction="focus.setDirection($event)"
      />

      <ol v-if="rows.length" class="flex-1 overflow-y-auto px-4 py-3">
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
      </ol>
      <p
        v-else
        class="px-4 py-6 text-center text-sm text-bnc-stone-500"
      >
        Tidak ada halte pada arah ini.
      </p>
    </aside>
  </transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 200ms ease, transform 250ms ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
