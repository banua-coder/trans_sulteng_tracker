<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useFocusStore } from '@/stores/focus'
import { useSelectionStore } from '@/stores/selection'
import { etaMinutes, formatDistance, isStale, parsePassenger } from '@/lib/format'
import type { BrtBus, BrtHalte } from '@/types/brt'

const brt = useBrtStore()
const focus = useFocusStore()
const selection = useSelectionStore()
const { corridor, halte, direction } = storeToRefs(focus)

const tick = ref(0)
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => (tick.value += 1), 15_000)
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

interface HalteRow {
  halte: BrtHalte
  next: BrtBus | null
  etaMin: number | null
  fresh: boolean
}

const rows = computed<HalteRow[]>(() => {
  void tick.value
  if (!corridor.value) return []
  const list: HalteRow[] = []
  for (const h of halte.value) {
    let best: { bus: BrtBus; eta: number | null } | null = null
    for (const bus of brt.buses.values()) {
      if (bus.kor !== h.kor) continue
      if (bus.new_shel_t !== h.sh_id) continue
      const eta = etaMinutes(bus.dist_shel ?? null, bus.speed ?? null)
      if (
        !best ||
        (eta != null && (best.eta == null || eta < best.eta))
      ) {
        best = { bus, eta }
      }
    }
    list.push({
      halte: h,
      next: best?.bus ?? null,
      etaMin: best?.eta ?? null,
      fresh: best ? !isStale(best.bus.dt_tracker) : false,
    })
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

function pickBus(b: BrtBus) {
  // Switching to bus-follow mode: drop the corridor focus first so we
  // don't stack two cards at the same screen position.
  focus.clear()
  selection.selectBus(b.imei || b.id)
}
</script>

<template>
  <transition name="slide-up">
    <aside
      v-if="focus.isFocused"
      class="pointer-events-auto fixed inset-x-3 bottom-3 z-[1000] mx-auto flex max-h-[78dvh] max-w-md flex-col overflow-hidden rounded-[var(--radius-md)] border border-bnc-stone-200 bg-white shadow-[var(--shadow-elevated)] sm:right-4 sm:left-auto sm:bottom-4 sm:max-w-md dark:border-bnc-stone-800 dark:bg-bnc-stone-900"
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
          <h3 class="truncate font-display text-base font-semibold tracking-tight">
            {{ directionLabel }}
          </h3>
          <p class="mt-0.5 font-mono text-[11px] text-bnc-stone-500">
            {{ rows.length }} halte · {{ activeBuses.length }} bus aktif
          </p>
        </div>
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
      </header>

      <div
        class="flex items-center gap-2 border-b border-bnc-stone-200 px-4 py-2 text-xs dark:border-bnc-stone-800"
      >
        <span class="font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500">
          Arah
        </span>
        <div
          class="ml-auto inline-flex rounded-full border border-bnc-stone-200 bg-bnc-stone-50 p-0.5 dark:border-bnc-stone-800 dark:bg-bnc-stone-800"
        >
          <button
            type="button"
            class="min-w-[44px] rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors"
            :class="
              direction === 'a'
                ? 'bg-bnc-ink text-bnc-paper dark:bg-bnc-paper dark:text-bnc-ink'
                : 'text-bnc-stone-500 hover:text-bnc-ink dark:hover:text-bnc-paper'
            "
            @click="focus.setDirection('a')"
          >
            A → B
          </button>
          <button
            type="button"
            class="min-w-[44px] rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors"
            :class="
              direction === 'b'
                ? 'bg-bnc-ink text-bnc-paper dark:bg-bnc-paper dark:text-bnc-ink'
                : 'text-bnc-stone-500 hover:text-bnc-ink dark:hover:text-bnc-paper'
            "
            @click="focus.setDirection('b')"
          >
            B → A
          </button>
        </div>
      </div>

      <ol
        v-if="rows.length"
        class="relative flex-1 overflow-y-auto px-4 py-3"
      >
        <li
          v-for="(r, idx) in rows"
          :key="r.halte.sh_id"
          class="relative flex items-start gap-3 pb-3"
        >
          <!-- vertical track + dot -->
          <span
            v-if="idx < rows.length - 1"
            class="absolute left-[7px] top-[18px] bottom-0 w-px"
            :style="{ background: accentColor, opacity: 0.5 }"
            aria-hidden
          />
          <span
            class="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white shadow"
            :style="{ background: accentColor, boxShadow: '0 0 0 1px ' + accentColor }"
            aria-hidden
          />
          <div class="flex w-full min-w-0 items-start gap-3 text-left">
            <div class="min-w-0 flex-1">
              <p class="truncate font-display text-sm font-semibold tracking-tight">
                {{ r.halte.sh_name }}
              </p>
              <p
                v-if="r.next"
                class="truncate font-mono text-[11px] text-bnc-stone-500"
              >
                {{ r.next.plate_number || r.next.name || r.next.kor }} ·
                {{ formatDistance(r.next.dist_shel) }}
                <template v-if="parsePassenger(r.next.passenger) != null">
                  · {{ parsePassenger(r.next.passenger) }} pax
                </template>
              </p>
              <p v-else class="font-mono text-[11px] text-bnc-stone-500">
                tidak ada bus mendekat
              </p>
            </div>
            <span class="ml-auto whitespace-nowrap font-mono text-sm tabular-nums">
              <template v-if="r.etaMin != null">
                ~ {{ Math.max(1, Math.round(r.etaMin)) }}m
              </template>
              <template v-else-if="r.next?.speed === 0">
                · approaching
              </template>
              <template v-else>
                —
              </template>
            </span>
            <span
              v-if="r.next && !r.fresh"
              class="ml-2 rounded-full bg-bnc-stone-200 px-1.5 py-0.5 font-mono text-[10px] uppercase text-bnc-stone-600 dark:bg-bnc-stone-700 dark:text-bnc-stone-300"
            >
              stale
            </span>
            <button
              v-if="r.next"
              type="button"
              class="ml-1 rounded-full bg-bnc-stone-100 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-bnc-stone-700 hover:bg-bnc-stone-200 dark:bg-bnc-stone-800 dark:text-bnc-stone-200 dark:hover:bg-bnc-stone-700"
              :title="'Buka detail bus'"
              @click.stop="pickBus(r.next)"
            >
              Lihat
            </button>
          </div>
        </li>
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
