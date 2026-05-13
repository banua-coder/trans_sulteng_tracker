<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useSelectionStore } from '@/stores/selection'
import { useBrtStore } from '@/stores/brt'
import { ageSeconds, etaToHalte, formatAge, formatDistance, formatSpeed, haversineMeters, isStale, parsePassenger } from '@/lib/format'
import CopyLinkButton from '@/components/CopyLinkButton.vue'
import PlateBadge from '@/components/PlateBadge.vue'

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

const updatedLabel = computed(() => {
  if (!selectedBus.value?.dt_tracker) return '—'
  // touch `now` so this re-evaluates each tick.
  void now.value
  const a = ageSeconds(selectedBus.value.dt_tracker)
  return `${formatAge(a)} ${t('units.ago')}`
})

const nextHalteRecord = computed(() => {
  const bus = selectedBus.value
  if (!bus?.new_shel_t) return null
  return brt.halte.find((x) => x.sh_id === bus.new_shel_t) ?? null
})

const nextHalte = computed(() => {
  return nextHalteRecord.value?.sh_name ?? selectedBus.value?.new_shel_t ?? null
})

const nextEta = computed(() => {
  const bus = selectedBus.value
  if (!bus) return null
  return etaToHalte(bus, nextHalteRecord.value)
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

  const startIdx = bus.new_shel_t
    ? orderedHalte.findIndex((h) => h.sh_id === bus.new_shel_t)
    : -1
  const slice = startIdx >= 0 ? orderedHalte.slice(startIdx) : orderedHalte.slice(0, 1)

  return slice.slice(0, 6).map((h, i) => {
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
      class="pointer-events-auto w-full max-w-md rounded-[var(--radius-md)] border border-bnc-stone-200 bg-white p-4 shadow-[var(--shadow-elevated)] sm:max-w-sm dark:border-bnc-stone-800 dark:bg-bnc-stone-900"
      role="dialog"
      :aria-label="t('bus.plate')"
    >
      <header class="flex items-start gap-2 sm:gap-3">
        <span
          class="grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold text-white sm:h-10 sm:w-10 sm:text-xs"
          :style="{ background: corridorColor }"
          aria-hidden
        >
          {{ selectedBus.kor || '·' }}
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <PlateBadge :plate="selectedBus.plate_number" size="md" />
            <span
              v-if="selectedBus.name"
              class="inline-flex shrink-0 items-center whitespace-nowrap rounded bg-bnc-stone-100 px-1.5 py-[3px] font-mono text-[11px] font-bold leading-none tracking-wider text-bnc-ink dark:bg-bnc-stone-800 dark:text-bnc-paper"
            >
              {{ selectedBus.name }}
            </span>
          </div>
          <p class="mt-1 truncate text-xs text-bnc-stone-500">
            <span class="font-mono uppercase tracking-wider">
              {{ t('bus.corridor') }} {{ selectedBus.kor || '—' }}
            </span>
            <span class="mx-1">·</span>
            → {{ selectedBus.toward || '—' }}
          </p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            class="rounded-full p-1 text-bnc-stone-500 transition-colors hover:bg-bnc-stone-100 hover:text-bnc-ink dark:hover:bg-bnc-stone-800 dark:hover:text-bnc-paper"
            :aria-label="'Tutup'"
            @click="selection.clear()"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
          <CopyLinkButton />
        </div>
      </header>

      <dl
        class="mt-3 grid gap-3 border-t border-bnc-stone-200 pt-3 text-xs dark:border-bnc-stone-800"
        :class="passenger != null ? 'grid-cols-3' : 'grid-cols-2'"
      >
        <div>
          <dt class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
            {{ t('bus.speed') }}
          </dt>
          <dd class="mt-0.5 font-mono text-base font-bold tabular-nums">
            {{ formatSpeed(selectedBus.speed) }}
            <span class="text-[10px] font-normal text-bnc-stone-500">{{ t('units.kmh') }}</span>
          </dd>
        </div>
        <div v-if="passenger != null">
          <dt class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
            {{ t('bus.passenger') }}
          </dt>
          <dd class="mt-0.5 font-mono text-base font-bold tabular-nums">
            {{ passenger }}
            <span class="text-[10px] font-normal text-bnc-stone-500">{{ t('bus.pax') }}</span>
          </dd>
        </div>
        <div>
          <dt class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
            {{ t('bus.lastUpdate') }}
          </dt>
          <dd
            class="mt-0.5 font-mono text-sm tabular-nums"
            :class="stale ? 'text-bnc-stone-500' : 'text-bnc-ink dark:text-bnc-paper'"
          >
            {{ updatedLabel }}
          </dd>
        </div>
      </dl>

      <!-- Upcoming stops -->
      <section
        v-if="upcomingStops.length"
        class="mt-3 border-t border-bnc-stone-200 pt-3 dark:border-bnc-stone-800"
      >
        <h4 class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
          {{ t('route.estimatedArrival') }}
        </h4>
        <ul class="mt-2 flex flex-col divide-y divide-bnc-stone-100 dark:divide-bnc-stone-800">
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
                <span class="block font-mono text-sm font-extrabold tabular-nums text-bnc-accent">
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
        class="mt-3 rounded-md bg-bnc-stone-100 px-2 py-1 text-[11px] text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300"
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
