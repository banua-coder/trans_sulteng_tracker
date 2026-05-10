<script setup lang="ts">
/**
 * Route Detail — mobile timeline of every halte on the chosen
 * corridor + the active buses heading toward each halte. Modeled
 * on TJ Transjakarta's "Route Details" screen (screenshot #1).
 *
 * URL: `/:city/routes/:kor`
 *
 * - Direction tabs (toward / reverse). Tabs with zero halte
 *   upstream are hidden — see focus store's directionAvailable.
 * - Each halte: dot + name + incoming-bus cards (armada + plate
 *   + ETA + last/next stop badge).
 * - "Peta" link in header → `/:city/routes/:kor/map` (full-screen
 *   focused map).
 *
 * Uses the existing focus + brt stores. On mount we ensure the
 * BRT routes are loaded and the live socket is connected so the
 * timeline can populate without a round-trip through CityView.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { useFocusStore } from '@/stores/focus'
import { useSocketStore } from '@/stores/socket'
import { etaToHalte, isStale } from '@/lib/format'
import HalteTimelineNode from '@/components/HalteTimelineNode.vue'
import IncomingBusCard from '@/components/IncomingBusCard.vue'
import type { BrtBus, BrtHalte } from '@/types/brt'

const props = defineProps<{ city: string; kor: string }>()

const { t } = useI18n()
const router = useRouter()
const brt = useBrtStore()
const city = useCityStore()
const focus = useFocusStore()
const socket = useSocketStore()
const { corridor, halte, direction, directionAvailable } = storeToRefs(focus)

// Tick once every 15 s so ETAs stay close to wall-clock truth.
const tick = ref(0)
let timer: number | undefined

onMounted(async () => {
  // Make sure BRT data + socket are ready when navigated to directly.
  if (!brt.corridors.length || !brt.halte.length) {
    await brt.loadRoutes(city.pref)
  }
  socket.connect(city.pref)
  focus.focus(props.kor)
  timer = window.setInterval(() => (tick.value += 1), 15_000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
  // Don't disconnect the socket — CityView shares the connection.
  // Clearing focus keeps the URL clean if the user goes back.
  focus.clear()
})

const accentColor = computed(() => corridor.value?.color || '#1D9CD4')

interface IncomingBus {
  bus: BrtBus
  etaMin: number | null
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
      const arrivalAt = etaMin != null ? formatArrivalAt(etaMin) : null
      incoming.push({
        bus,
        etaMin,
        arrivalAt,
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

function formatArrivalAt(etaMin: number): string {
  const t = new Date(Date.now() + Math.max(0, etaMin) * 60_000)
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`
}
function pad(n: number) {
  return n < 10 ? `0${n}` : String(n)
}

function back() {
  router.push({ name: 'routes-index', params: { city: props.city } })
}
function openMap() {
  router.push({ name: 'route-map', params: { city: props.city, kor: props.kor } })
}
</script>

<template>
  <section class="mx-auto flex h-full max-w-2xl flex-col bg-bnc-paper dark:bg-bnc-ink">
    <!-- header -->
    <header class="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-bnc-stone-200 bg-bnc-paper/95 px-4 py-3 backdrop-blur dark:border-bnc-stone-800 dark:bg-bnc-ink/95">
      <div class="flex min-w-0 items-center gap-2">
        <button
          type="button"
          class="grid h-9 w-9 shrink-0 place-items-center rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
          :aria-label="t('a11y.back')"
          @click="back"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1 class="truncate font-display text-base font-semibold tracking-tight">
          {{ t('route.detailTitle') }}
        </h1>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-full bg-bnc-primary px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90"
        @click="openMap"
      >
        {{ t('route.viewMap') }}
      </button>
    </header>

    <div v-if="corridor" class="border-b border-bnc-stone-200 px-4 pt-3 pb-4 dark:border-bnc-stone-800">
      <div class="flex items-center gap-2">
        <span
          class="grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-xs font-extrabold text-white"
          :style="{ background: accentColor }"
          aria-hidden
        >
          {{ corridor.kor }}
        </span>
        <h2 class="truncate font-display text-lg font-bold tracking-tight">
          {{ corridor.origin }} – {{ corridor.toward }}
        </h2>
      </div>

      <!-- direction tabs -->
      <div
        v-if="directionAvailable.a || directionAvailable.b"
        class="mt-3 flex border-b border-bnc-stone-200 dark:border-bnc-stone-800"
      >
        <button
          v-if="directionAvailable.a"
          type="button"
          class="flex-1 px-2 pb-2 pt-1 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors"
          :class="
            direction === 'a'
              ? 'border-b-2 border-bnc-primary text-bnc-primary'
              : 'text-bnc-stone-500 hover:text-bnc-stone-700 dark:hover:text-bnc-stone-300'
          "
          @click="focus.setDirection('a')"
        >
          {{ corridor.origin }} – {{ corridor.toward }}
        </button>
        <button
          v-if="directionAvailable.b"
          type="button"
          class="flex-1 px-2 pb-2 pt-1 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors"
          :class="
            direction === 'b'
              ? 'border-b-2 border-bnc-primary text-bnc-primary'
              : 'text-bnc-stone-500 hover:text-bnc-stone-700 dark:hover:text-bnc-stone-300'
          "
          @click="focus.setDirection('b')"
        >
          {{ corridor.toward }} – {{ corridor.origin }}
        </button>
      </div>

      <p
        v-if="!directionAvailable.a || !directionAvailable.b"
        class="mt-2 rounded-md bg-bnc-stone-100 px-2 py-1.5 text-[11px] text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300"
      >
        {{ t('route.oneWayOnly') }}
      </p>

      <p class="mt-3 text-[11px] leading-snug text-bnc-stone-500">
        {{ t('route.disclaimer') }}
      </p>
    </div>

    <!-- timeline -->
    <ol class="flex-1 overflow-y-auto px-4 py-3">
      <HalteTimelineNode
        v-for="(r, idx) in rows"
        :key="r.halte.sh_id"
        :haltename="r.halte.sh_name"
        :accent-color="accentColor"
        :is-first="idx === 0"
        :is-last="idx === rows.length - 1"
      >
        <IncomingBusCard
          v-for="ib in r.incoming"
          :key="ib.bus.imei || ib.bus.id"
          :kor="ib.bus.kor"
          :corridor-color="accentColor"
          :plate="ib.bus.plate_number ?? null"
          :armada="ib.bus.name ?? null"
          :eta-min="ib.etaMin"
          :arrival-at="ib.arrivalAt"
          :status="ib.status"
          :toward="ib.status === 'last' ? r.halte.sh_name : r.halte.sh_name"
          :stale="ib.stale"
        />
      </HalteTimelineNode>

      <li
        v-if="corridor && !rows.length"
        class="rounded-md bg-bnc-stone-100 px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500 dark:bg-bnc-stone-800"
      >
        {{ t('route.noHalte') }}
      </li>
    </ol>
  </section>
</template>
