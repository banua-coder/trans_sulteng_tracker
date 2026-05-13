<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useFocusStore } from '@/stores/focus'
import { useSelectionStore } from '@/stores/selection'
import { etaToHalte, getEtaQuality, isStale, parseProgress } from '@/lib/format'
import CopyLinkButton from '@/components/CopyLinkButton.vue'
import HalteTimelineNode from '@/components/HalteTimelineNode.vue'
import IncomingBusCard from '@/components/IncomingBusCard.vue'
import type { BrtBus, BrtHalte } from '@/types/brt'

const brt = useBrtStore()
const focus = useFocusStore()
const selection = useSelectionStore()
const { corridor, halte, direction, directionAvailable } = storeToRefs(focus)

const tick = ref(0)
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => (tick.value += 1), 15_000)
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

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

function formatArrivalAt(etaMin: number): string {
  const d = new Date(Date.now() + Math.max(0, etaMin) * 60_000)
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const rows = computed<HalteRow[]>(() => {
  void tick.value
  if (!corridor.value) return []
  const buses = [...brt.buses.values()].filter((b) => b.kor === corridor.value!.kor)
  const list: HalteRow[] = []
  for (let i = 0; i < halte.value.length; i++) {
    const h = halte.value[i]
    const isTerminal = i === halte.value.length - 1
    const incoming: IncomingBus[] = []
    for (const bus of buses) {
      if (bus.new_shel_t !== h.sh_id) continue
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
    list.push({ halte: h, incoming })
  }
  return list
})

const activeBuses = computed(() => {
  const c = corridor.value
  if (!c) return [] as BrtBus[]
  return [...brt.buses.values()].filter((b) => b.kor === c.kor)
})

const accentColor = computed(() => corridor.value?.color || '#1D9CD4')

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

      <div
        class="border-b border-bnc-stone-200 px-4 py-3 dark:border-bnc-stone-800"
      >
        <p class="font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500">
          Arah
        </p>
        <div class="mt-2 grid gap-1.5">
          <button
            v-if="directionAvailable.a"
            type="button"
            class="flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors"
            :class="
              direction === 'a'
                ? 'border-bnc-ink bg-bnc-ink text-bnc-paper dark:border-bnc-paper dark:bg-bnc-paper dark:text-bnc-ink'
                : 'border-bnc-stone-200 bg-bnc-stone-50 text-bnc-stone-700 hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-800/50 dark:text-bnc-stone-200'
            "
            @click="focus.setDirection('a')"
          >
            <span class="shrink-0 font-mono text-[11px] uppercase tracking-wider opacity-70">
              →
            </span>
            <span class="font-display font-semibold">{{ corridor?.toward || '—' }}</span>
          </button>
          <button
            v-if="directionAvailable.b"
            type="button"
            class="flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors"
            :class="
              direction === 'b'
                ? 'border-bnc-ink bg-bnc-ink text-bnc-paper dark:border-bnc-paper dark:bg-bnc-paper dark:text-bnc-ink'
                : 'border-bnc-stone-200 bg-bnc-stone-50 text-bnc-stone-700 hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-800/50 dark:text-bnc-stone-200'
            "
            @click="focus.setDirection('b')"
          >
            <span class="shrink-0 font-mono text-[11px] uppercase tracking-wider opacity-70">
              →
            </span>
            <span class="font-display font-semibold">{{ corridor?.origin || '—' }}</span>
          </button>
          <p
            v-if="!directionAvailable.a || !directionAvailable.b"
            class="rounded-md bg-bnc-stone-100 px-2 py-1.5 text-[11px] text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300"
          >
            Operator hanya menyediakan halte satu arah untuk koridor ini.
          </p>
        </div>
      </div>

      <ol v-if="rows.length" class="flex-1 overflow-y-auto px-4 py-3">
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
