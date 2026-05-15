<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useSelectionStore } from '@/stores/selection'
import { useBrtStore } from '@/stores/brt'
import { ageSeconds, busLegProgress, etaToHalte, formatAge, formatSpeed, getEtaQuality, haversineMeters, isStale, parsePassenger } from '@/lib/format'
import CopyLinkButton from '@/components/CopyLinkButton.vue'
import PlateBadge from '@/components/PlateBadge.vue'
import EtaQualityGuide from '@/components/EtaQualityGuide.vue'

const { t } = useI18n()
const selection = useSelectionStore()
const brt = useBrtStore()
const { selectedBus } = storeToRefs(selection)

const now = ref(Date.now())
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

const corridorColor = computed(() =>
  selectedBus.value ? brt.colorForKor(selectedBus.value.kor) : '#0EA5E9',
)

const stale = computed(() =>
  selectedBus.value ? isStale(selectedBus.value) : false,
)

const etaQuality = computed(() => getEtaQuality(selectedBus.value ?? null))
const etaColorStyle = computed(() => ({ color: `var(--color-${etaQuality.value})` }))

const updatedLabel = computed(() => {
  if (!selectedBus.value?.dt_tracker) return '—'
  // touch `now` so this re-evaluates each tick.
  void now.value
  const a = ageSeconds(selectedBus.value.dt_tracker)
  return `${formatAge(a)} ${t('units.ago')}`
})

const passenger = computed(() =>
  selectedBus.value ? parsePassenger(selectedBus.value.passenger) : null,
)

interface UpcomingStop {
  sh_id: string
  sh_name: string
  etaMin: number | null
  distM: number | null
  arrivalAt: string | null
}

function pad(n: number) { return n < 10 ? `0${n}` : String(n) }
function wallClock(etaMin: number): string {
  const d = new Date(Date.now() + Math.max(0, etaMin) * 60_000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

watch(
  selectedBus,
  (bus) => {
    if (!bus?.kor) return
    const corridor = brt.corridorByKor.get(bus.kor)
    if (!corridor) return
    const originName = bus.toward === corridor.toward ? corridor.origin : corridor.toward
    brt.ensureHalteForLeg(bus.kor, bus.toward, originName).catch(() => {})
  },
  { immediate: true },
)

const upcomingStops = computed<UpcomingStop[]>(() => {
  const bus = selectedBus.value
  if (!bus?.kor) return []
  const corridor = brt.corridorByKor.get(bus.kor)
  if (!corridor) return []

  const originName = bus.toward === corridor.toward ? corridor.origin : corridor.toward
  const orderedHalte = brt.getHalteForLeg(bus.kor, bus.toward, originName)

  // Find the next halte by GPS, not by new_shel_t — upstream's stop
  // pointer lags so badly at terminus halte (e.g. Wisma Donggala,
  // which appears in both legs with the same sh_id) that a bus parked
  // at the turnaround keeps reporting it as "next stop" forever, then
  // the slice from new_shel_t includes every halte the bus already
  // passed on the previous leg.
  const startIdx = busLegProgress(bus, orderedHalte)
  const slice = orderedHalte.length ? orderedHalte.slice(startIdx) : []

  // Show every upcoming stop through the corridor's terminus — user
  // wants the full ride visible, not just the next handful.
  return slice.map((h, i) => {
    let distM: number | null = null
    let etaMin: number | null = null

    if (i === 0 && h.sh_id === bus.new_shel_t) {
      const eta = etaToHalte(bus, h)
      distM = eta?.distM ?? null
      etaMin = eta?.etaMin ?? null
    } else if (Number.isFinite(bus.lat) && Number.isFinite(bus.lng)) {
      const hLat = typeof h.sh_lat === 'string' ? parseFloat(h.sh_lat) : Number(h.sh_lat)
      const hLng = typeof h.sh_lng === 'string' ? parseFloat(h.sh_lng) : Number(h.sh_lng)
      if (Number.isFinite(hLat) && Number.isFinite(hLng)) {
        distM = haversineMeters({ lat: bus.lat!, lng: bus.lng! }, { lat: hLat, lng: hLng })
        const spd = Number.isFinite(bus.speed) && Number(bus.speed) >= 5 ? Number(bus.speed) : 22
        etaMin = (distM / 1000) / spd * 60
      }
    }

    return {
      sh_id: h.sh_id,
      sh_name: h.sh_name,
      etaMin,
      distM,
      arrivalAt: etaMin != null ? wallClock(etaMin) : null,
    }
  })
})
</script>

<template>
  <transition name="slide-up">
    <article
      v-if="selectedBus"
      class="pointer-events-auto flex w-full flex-col gap-3 sm:max-w-sm lg:max-w-md lg:rounded-[var(--radius-md)] lg:border lg:border-bnc-stone-200 lg:bg-white lg:p-4 lg:shadow-[var(--shadow-elevated)] dark:lg:border-bnc-stone-800 dark:lg:bg-bnc-stone-900"
      role="dialog"
      :aria-label="t('bus.plate')"
    >
      <!-- Sticky header on mobile (inside the bottom sheet's scroll
           context), static on desktop. Bg matches the sheet surface. -->
      <div
        class="sticky -top-1 z-20 -mx-4 flex flex-col gap-2 bg-bnc-paper px-4 pb-3 pt-2 shadow-[0_4px_8px_-6px_rgba(10,14,20,0.12)] dark:bg-bnc-stone-900 lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:shadow-none dark:lg:bg-transparent"
      >
        <header class="flex items-center gap-2">
          <button
            type="button"
            class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
            :aria-label="t('a11y.back')"
            @click="selection.clear()"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <span
            class="grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold text-white"
            :style="{ background: corridorColor }"
            aria-hidden
          >
            {{ selectedBus.kor || '·' }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <PlateBadge :plate="selectedBus.plate_number" size="sm" />
              <span
                v-if="selectedBus.name"
                class="inline-flex shrink-0 items-center whitespace-nowrap rounded bg-bnc-stone-100 px-1 py-[1px] font-mono text-[10px] font-bold leading-none tracking-wider text-bnc-ink dark:bg-bnc-stone-800 dark:text-bnc-paper"
              >
                {{ selectedBus.name }}
              </span>
            </div>
            <p class="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
              → {{ selectedBus.toward || '—' }}
            </p>
            <!-- Inline bus telemetry: speed + freshness + (optional) pax.
                 Lives directly under the last-stop line so we don't waste
                 a separate stats grid full of whitespace. -->
            <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] tabular-nums">
              <span class="text-bnc-stone-700 dark:text-bnc-stone-200">
                <span class="font-bold">{{ formatSpeed(selectedBus.speed) }}</span>
                <span class="text-bnc-stone-500"> {{ t('units.kmh') }}</span>
              </span>
              <span class="text-bnc-stone-300 dark:text-bnc-stone-600">·</span>
              <span :class="stale ? 'text-bnc-stone-500' : 'text-bnc-stone-700 dark:text-bnc-stone-200'">
                {{ updatedLabel }}
              </span>
              <template v-if="passenger != null">
                <span class="text-bnc-stone-300 dark:text-bnc-stone-600">·</span>
                <span class="text-bnc-stone-700 dark:text-bnc-stone-200">
                  <span class="font-bold">{{ passenger }}</span>
                  <span class="text-bnc-stone-500"> {{ t('bus.pax') }}</span>
                </span>
              </template>
            </p>
          </div>
          <EtaQualityGuide class="lg:hidden" />
          <CopyLinkButton />
        </header>
      </div>

      <!-- Upcoming stops -->
      <section
        v-if="upcomingStops.length"
        class="border-t border-bnc-stone-200 pt-3 dark:border-bnc-stone-800"
      >
        <h4 class="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
          {{ t('route.estimatedArrival') }}
          <EtaQualityGuide class="hidden lg:inline-flex" />
        </h4>
        <ul class="mt-2 flex max-h-[60vh] flex-col divide-y divide-bnc-stone-100 overflow-y-auto pr-1 dark:divide-bnc-stone-800">
          <li
            v-for="(stop, i) in upcomingStops"
            :key="stop.sh_id"
            class="group"
          >
            <button
              type="button"
              class="flex w-full items-center gap-3 py-2 text-left transition-colors hover:bg-bnc-stone-50 dark:hover:bg-bnc-stone-800/50"
              @click="selection.selectHalte(stop.sh_id)"
            >
              <span
                class="grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[9px] font-bold text-white"
                :style="{ background: corridorColor }"
                aria-hidden
              >
                {{ i + 1 }}
              </span>
              <span class="min-w-0 flex-1 truncate text-xs font-medium">{{ stop.sh_name }}</span>
              <span class="shrink-0 text-right">
                <span
                  class="block font-mono text-sm font-extrabold tabular-nums text-bnc-accent"
                  :style="etaColorStyle"
                >
                  <template v-if="stop.etaMin != null">
                    {{ Math.max(1, Math.round(stop.etaMin)) }}
                    <span class="text-[10px] font-normal text-bnc-stone-500">{{ t('units.minutes') }}</span>
                  </template>
                  <template v-else>—</template>
                </span>
                <span v-if="stop.arrivalAt" class="block font-mono text-[10px] text-bnc-stone-500">
                  {{ stop.arrivalAt }}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <p
        v-if="stale"
        class="rounded-md bg-bnc-stone-100 px-2 py-1 text-[11px] text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300"
      >
        {{ t('status.stale') }} · &gt; 5 {{ t('units.minutes') }}
      </p>
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
