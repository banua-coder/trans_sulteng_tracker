<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useSelectionStore } from '@/stores/selection'
import { useBrtStore } from '@/stores/brt'
import { etaToHalte, formatDistance, isStale, parsePassenger } from '@/lib/format'
import CopyLinkButton from '@/components/CopyLinkButton.vue'
import PlateBadge from '@/components/PlateBadge.vue'
import type { BrtBus } from '@/types/brt'

const { t } = useI18n()
const selection = useSelectionStore()
const brt = useBrtStore()
const { selectedHalte } = storeToRefs(selection)

const tick = ref(0)
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => {
    tick.value += 1
  }, 15_000)
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

interface Arrival {
  bus: BrtBus
  etaMin: number | null
  distM: number | null
  fresh: boolean
  corridorColor: string
}

const corridorsAtHalte = computed(() => {
  const halte = selectedHalte.value
  if (!halte) return []

  // Parse in_koridor and color_koridor the same way the Android app does:
  // split by "|", pair each corridor code with its color, fall back to
  // halte.color or the corridor store color if the color list is shorter.
  const kors = halte.in_koridor ? halte.in_koridor.split('|').filter(Boolean) : [halte.kor]
  const colors = halte.color_koridor ? halte.color_koridor.split('|') : []

  const seen = new Set<string>()
  const result: { kor: string; color: string }[] = []
  kors.forEach((kor, i) => {
    if (seen.has(kor)) return
    seen.add(kor)
    const pairedColor = colors[i] || halte.color || '#0EA5E9'
    result.push({ kor, color: brt.colorForKor(kor) || pairedColor })
  })
  return result
})

const arrivals = computed<Arrival[]>(() => {
  void tick.value
  const halte = selectedHalte.value
  if (!halte) return []

  // Collect sh_ids for all halte records sharing this physical stop (same name).
  const shIds = new Set(
    brt.halte
      .filter((h) => h.sh_name === halte.sh_name)
      .map((h) => h.sh_id),
  )

  const candidates: Arrival[] = []
  for (const bus of brt.buses.values()) {
    if (!bus.new_shel_t || !shIds.has(bus.new_shel_t)) continue
    const targetHalte = brt.halte.find((h) => h.sh_id === bus.new_shel_t) ?? halte
    const eta = etaToHalte(bus, targetHalte)
    candidates.push({
      bus,
      etaMin: eta?.etaMin ?? null,
      distM: eta?.distM ?? null,
      fresh: !isStale(bus),
      corridorColor: brt.colorForKor(bus.kor) || '#0EA5E9',
    })
  }
  candidates.sort((a, b) => {
    if (a.etaMin == null && b.etaMin == null) return 0
    if (a.etaMin == null) return 1
    if (b.etaMin == null) return -1
    return a.etaMin - b.etaMin
  })
  return candidates
})

function pickBus(imei: string) {
  selection.selectBus(imei)
}

function openDirections() {
  const h = selectedHalte.value
  if (!h) return
  const lat = parseFloat(h.sh_lat)
  const lng = parseFloat(h.sh_lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
  // Universal Google Maps directions link — Google's deep link resolver
  // hands off to the native Maps app on iOS / Android and falls back to
  // the web client elsewhere. `dir_action=navigate` jumps straight into
  // turn-by-turn from the user's current location.
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking&dir_action=navigate`
  window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <transition name="slide-up">
    <article
      v-if="selectedHalte"
      class="pointer-events-auto flex w-full flex-col gap-3 sm:max-w-sm lg:max-w-md lg:rounded-[var(--radius-md)] lg:border lg:border-bnc-stone-200 lg:bg-white lg:p-4 lg:shadow-[var(--shadow-elevated)] dark:lg:border-bnc-stone-800 dark:lg:bg-bnc-stone-900"
      role="dialog"
      :aria-label="selectedHalte.sh_name"
    >
      <!-- Sticky on mobile (inside the bottom sheet's scroll context),
           static on desktop where the article is already a floating card.
           The bg matches the sheet surface so scrolling buses don't bleed
           through. -->
      <div
        class="sticky -top-1 z-20 -mx-4 flex flex-col gap-2 bg-bnc-paper px-4 pb-3 pt-2 shadow-[0_4px_8px_-6px_rgba(10,14,20,0.12)] dark:bg-bnc-stone-900 lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:shadow-none dark:lg:bg-transparent"
      >
        <header class="flex items-center gap-2">
          <button
            type="button"
            class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
            :aria-label="t('a11y.back') || 'Tutup'"
            @click="selection.clear()"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <div class="min-w-0 flex-1">
            <p class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
              {{ t('bus.halte') }}
            </p>
            <h3 class="truncate font-display text-sm font-bold tracking-tight">
              {{ selectedHalte.sh_name }}
            </h3>
          </div>
          <div class="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-bnc-stone-500 transition-colors hover:bg-bnc-stone-100 hover:text-bnc-accent dark:hover:bg-bnc-stone-800"
              :aria-label="t('halte.directions')"
              :title="t('halte.directions')"
              @click="openDirections"
            >
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
                <path d="M3 11 22 2l-9 19-2-8z" />
              </svg>
            </button>
            <CopyLinkButton />
          </div>
        </header>

        <!-- Corridor badges — rounded rectangles, not circles, so the
             code is readable when the user is on a multi-corridor stop. -->
        <div v-if="corridorsAtHalte.length" class="flex flex-wrap gap-1">
          <span
            v-for="c in corridorsAtHalte"
            :key="c.kor"
            class="inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
            :style="{ background: c.color }"
          >
            {{ c.kor }}
          </span>
        </div>
      </div>

      <section class="border-t border-bnc-stone-200 pt-3 dark:border-bnc-stone-800">
        <h4 class="font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500">
          {{ t('halte.incomingBuses') }}
        </h4>
        <ul v-if="arrivals.length" class="mt-2 flex flex-col gap-2">
          <li
            v-for="a in arrivals"
            :key="a.bus.imei || a.bus.id"
          >
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-md border border-bnc-stone-200 bg-bnc-stone-50 px-2 py-2 text-left transition-colors hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-800/50 dark:hover:border-bnc-stone-700"
              @click="pickBus(a.bus.imei || a.bus.id)"
            >
              <!-- Corridor dot -->
              <span
                class="h-2 w-2 shrink-0 rounded-full"
                :style="{ background: a.corridorColor }"
                aria-hidden
              />
              <div class="flex min-w-0 flex-col">
                <div class="flex items-center gap-1.5">
                  <PlateBadge v-if="a.bus.plate_number" :plate="a.bus.plate_number" size="sm" />
                  <span
                    v-else
                    class="truncate font-mono text-xs font-bold text-bnc-ink dark:text-bnc-paper"
                  >
                    {{ a.bus.kor }}
                  </span>
                  <span
                    v-if="a.bus.name"
                    class="inline-flex items-center rounded bg-bnc-stone-200 px-1 py-[1px] font-mono text-[9px] font-bold tracking-wider dark:bg-bnc-stone-700"
                  >
                    {{ a.bus.name }}
                  </span>
                  <span
                    v-if="!a.fresh"
                    class="rounded-full bg-bnc-stone-200 px-1.5 py-0.5 font-mono text-[10px] uppercase text-bnc-stone-600 dark:bg-bnc-stone-700 dark:text-bnc-stone-300"
                  >
                    stale
                  </span>
                </div>
                <p class="mt-0.5 font-mono text-[10px] text-bnc-stone-500">
                  <template v-if="a.distM != null">{{ formatDistance(a.distM) }}</template>
                  <template v-else>—</template>
                  <template v-if="parsePassenger(a.bus.passenger) != null">
                    · {{ parsePassenger(a.bus.passenger) }} pax
                  </template>
                </p>
              </div>
              <span class="ml-auto font-mono text-sm font-bold tabular-nums text-bnc-accent">
                <template v-if="a.etaMin != null">
                  ~{{ Math.max(1, Math.round(a.etaMin)) }}<span class="text-[10px] font-normal text-bnc-stone-500">{{ t('units.minutes') }}</span>
                </template>
                <template v-else>—</template>
              </span>
            </button>
          </li>
        </ul>
        <p v-else class="mt-2 text-xs text-bnc-stone-500">
          {{ t('halte.noBuses') }}
        </p>
      </section>
    </article>
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
