<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useSelectionStore } from '@/stores/selection'
import { useBrtStore } from '@/stores/brt'
import { formatDistance, formatSpeed, parsePassenger } from '@/lib/format'
import CopyLinkButton from '@/components/CopyLinkButton.vue'
import PlateBadge from '@/components/PlateBadge.vue'
import EtaQualityGuide from '@/components/EtaQualityGuide.vue'
import SheetStickyHeader from '@/components/SheetStickyHeader.vue'
import { useHalteAnnouncements } from '@/composables/useHalteAnnouncements'

const { t } = useI18n()
const selection = useSelectionStore()
const brt = useBrtStore()
const { selectedHalte, halteFilterKor } = storeToRefs(selection)

// Once a halte is selected, eagerly pull both legs of every corridor
// that serves it. The store's incomingBusesForHalte selector walks
// per-leg halte to decide whether an approaching bus's path passes
// this stop; bulk-feed fallbacks lose the terminus halte (Donggala's
// Wisma Donggala is in the reverse leg only), so without these
// fetches the forward-leg progress check would silently fail.
watch(
  selectedHalte,
  (halte) => {
    if (!halte) return
    const kors = new Set<string>([halte.kor])
    if (halte.in_koridor) {
      for (const k of halte.in_koridor.split('|').filter(Boolean)) kors.add(k)
    }
    for (const kor of kors) {
      const c = brt.corridorByKor.get(kor)
      if (!c) continue
      brt.ensureHalteForLeg(kor, c.toward, c.origin).catch(() => {})
      brt.ensureHalteForLeg(kor, c.origin, c.toward).catch(() => {})
    }
  },
  { immediate: true },
)

// Derived data lives in the brt store — this component is a pure
// renderer over `arrivals`. The selector reacts to halteFilterKor so
// tapping a corridor pill below narrows the bus list.
const arrivals = brt.incomingBusesForHalte(selectedHalte, halteFilterKor)

// Voice announcement on bus approach + arrival at this halte. No-op
// when audio is disabled in Settings. State (which buses already
// announced) lives inside the composable, scoped to selectedHalte.
useHalteAnnouncements(selectedHalte, arrivals)

// HalteDetailCard shows badges without a "current" highlight (the
// card is reached from the map or a corridor, not anchored to one),
// so we pass null for currentKor — every badge renders at full
// opacity in the template below.
const corridorsAtHalte = computed(() =>
  selectedHalte.value
    ? brt.corridorBadgesForHalte(selectedHalte.value, null)
    : [],
)

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
      <SheetStickyHeader
        :back-label="t('a11y.back') || 'Tutup'"
        mobile-only
        @back="selection.back()"
      >
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
          <EtaQualityGuide class="lg:hidden" />
          <CopyLinkButton />
        </div>
        <template #belowTitle>
          <!-- Corridor badges — rounded rectangles, not circles, so the
               code is readable when the user is on a multi-corridor stop.
               When >1 corridor passes through, the badges become click
               targets that filter the incoming-bus list below. -->
          <div v-if="corridorsAtHalte.length" class="flex flex-wrap items-center gap-1">
            <component
              :is="corridorsAtHalte.length > 1 ? 'button' : 'span'"
              v-for="c in corridorsAtHalte"
              :key="c.kor"
              :type="corridorsAtHalte.length > 1 ? 'button' : undefined"
              class="inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white transition-opacity"
              :style="{
                background: c.color,
                opacity: halteFilterKor === null || halteFilterKor === c.kor ? 1 : 0.4,
              }"
              :aria-pressed="corridorsAtHalte.length > 1 ? halteFilterKor === c.kor : undefined"
              @click="corridorsAtHalte.length > 1 ? selection.toggleHalteFilter(c.kor) : undefined"
            >
              {{ c.kor }}
            </component>
            <button
              v-if="halteFilterKor !== null && corridorsAtHalte.length > 1"
              type="button"
              class="inline-flex items-center rounded-md border border-bnc-stone-300 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:border-bnc-stone-700 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
              @click="selection.clearHalteFilter()"
            >
              {{ t('halte.showAll') || 'All' }}
            </button>
          </div>
        </template>
      </SheetStickyHeader>

      <section class="border-t border-bnc-stone-200 pt-3 dark:border-bnc-stone-800">
        <h4 class="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500">
          {{ t('halte.incomingBuses') }}
          <EtaQualityGuide class="hidden lg:inline-flex" />
        </h4>
        <ul v-if="arrivals.length" class="mt-2 flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
          <li
            v-for="a in arrivals"
            :key="a.bus.imei || a.bus.id"
          >
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-md border border-bnc-stone-200 bg-bnc-stone-50 px-2 py-2 text-left transition-colors hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-800/50 dark:hover:border-bnc-stone-700"
              @click="pickBus(a.bus.imei || a.bus.id)"
            >
              <!-- Corridor kor badge -->
              <span
                class="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
                :style="{ background: a.corridorColor }"
              >
                {{ a.bus.kor }}
              </span>
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
                    v-if="a.atStop"
                    class="rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
                    :style="{ background: 'var(--color-good)' }"
                  >
                    {{ t('halte.atStop') }}
                  </span>
                </div>
                <p class="mt-0.5 font-mono text-[10px] tabular-nums text-bnc-stone-500">
                  <template v-if="a.distM != null">{{ formatDistance(a.distM) }}</template>
                  <template v-else>—</template>
                  <span class="text-bnc-stone-300 dark:text-bnc-stone-600"> · </span>
                  <span :class="a.fresh ? 'text-bnc-stone-700 dark:text-bnc-stone-200' : 'text-bnc-stone-500'">
                    <span class="font-bold">{{ formatSpeed(a.bus.speed) }}</span>
                    {{ t('units.kmh') }}
                  </span>
                  <template v-if="parsePassenger(a.bus.passenger) != null">
                    <span class="text-bnc-stone-300 dark:text-bnc-stone-600"> · </span>
                    {{ parsePassenger(a.bus.passenger) }} pax
                  </template>
                  <template v-if="!a.fresh">
                    <span class="text-bnc-stone-300 dark:text-bnc-stone-600"> · </span>
                    <span class="uppercase text-bnc-stone-500">stale</span>
                  </template>
                </p>
              </div>
              <span class="ml-auto flex flex-col items-end">
                <span
                  class="font-mono text-sm font-bold tabular-nums text-bnc-accent"
                  :style="{ color: `var(--color-${a.quality})` }"
                >
                  <template v-if="a.etaMin != null">
                    ~{{ Math.max(1, Math.round(a.etaMin)) }}<span class="text-[10px] font-normal text-bnc-stone-500">{{ t('units.minutes') }}</span>
                  </template>
                  <template v-else>—</template>
                </span>
                <span
                  v-if="a.arrivalAt"
                  class="font-mono text-[10px] tabular-nums text-bnc-stone-500"
                >
                  {{ a.arrivalAt }}
                </span>
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
