<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useFocusStore } from '@/stores/focus'
import { useSelectionStore } from '@/stores/selection'
import { etaToHalte, formatDistance, isStale, parsePassenger } from '@/lib/format'
import CopyLinkButton from '@/components/CopyLinkButton.vue'
import PlateBadge from '@/components/PlateBadge.vue'
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

interface HalteRow {
  halte: BrtHalte
  next: BrtBus | null
  etaMin: number | null
  distM: number | null
  fresh: boolean
}

const rows = computed<HalteRow[]>(() => {
  void tick.value
  if (!corridor.value) return []
  const list: HalteRow[] = []
  for (const h of halte.value) {
    let best: { bus: BrtBus; eta: number | null; dist: number | null } | null = null
    for (const bus of brt.buses.values()) {
      if (bus.kor !== h.kor) continue
      if (bus.new_shel_t !== h.sh_id) continue
      const r = etaToHalte(bus, h)
      const eta = r?.etaMin ?? null
      const dist = r?.distM ?? null
      if (
        !best ||
        (eta != null && (best.eta == null || eta < best.eta))
      ) {
        best = { bus, eta, dist }
      }
    }
    list.push({
      halte: h,
      next: best?.bus ?? null,
      etaMin: best?.eta ?? null,
      distM: best?.dist ?? null,
      fresh: best ? !isStale(best.bus) : false,
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
  // Selecting a bus while a corridor is focused doesn't drop the focus
  // — CityView swaps the focus panel for the bus card while the bus is
  // selected, and restores the focus panel when the user closes it.
  selection.selectBus(b.imei || b.id)
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
              <div v-if="r.next" class="mt-0.5 flex flex-wrap items-center gap-1.5">
                <PlateBadge v-if="r.next.plate_number" :plate="r.next.plate_number" size="sm" />
                <span
                  v-else
                  class="font-mono text-[11px] font-bold text-bnc-ink dark:text-bnc-paper"
                >
                  {{ r.next.kor }}
                </span>
                <span
                  v-if="r.next.name"
                  class="inline-flex items-center rounded bg-bnc-stone-100 px-1 py-[1px] font-mono text-[9px] font-bold tracking-wider text-bnc-ink dark:bg-bnc-stone-800 dark:text-bnc-paper"
                >
                  {{ r.next.name }}
                </span>
                <span class="font-mono text-[11px] text-bnc-stone-500">
                  <template v-if="r.distM != null">{{ formatDistance(r.distM) }}</template>
                  <template v-if="parsePassenger(r.next.passenger) != null">
                    · {{ parsePassenger(r.next.passenger) }} pax
                  </template>
                </span>
              </div>
              <p v-else class="font-mono text-[11px] text-bnc-stone-500">
                tidak ada bus mendekat
              </p>
            </div>
            <span class="ml-auto whitespace-nowrap font-mono text-sm font-bold tabular-nums text-bnc-accent">
              <template v-if="r.etaMin != null">
                ~ {{ Math.max(1, Math.round(r.etaMin)) }}m
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
