<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useSelectionStore } from '@/stores/selection'
import { useBrtStore } from '@/stores/brt'
import { ageSeconds, formatAge, formatDistance, formatSpeed, isStale } from '@/lib/format'

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
  selectedBus.value ? isStale(selectedBus.value.dt_tracker) : false,
)

const updatedLabel = computed(() => {
  if (!selectedBus.value?.dt_tracker) return '—'
  // touch `now` so this re-evaluates each tick.
  void now.value
  const a = ageSeconds(selectedBus.value.dt_tracker)
  return `${formatAge(a)} ${t('units.ago')}`
})

const nextHalte = computed(() => {
  const bus = selectedBus.value
  if (!bus?.new_shel_t) return null
  const h = brt.halte.find((x) => x.sh_id === bus.new_shel_t)
  return h?.sh_name ?? bus.new_shel_t
})
</script>

<template>
  <transition name="slide-up">
    <article
      v-if="selectedBus"
      class="pointer-events-auto fixed inset-x-3 bottom-3 z-30 mx-auto max-w-md rounded-[var(--radius-md)] border border-bnc-stone-200 bg-white p-4 shadow-[var(--shadow-elevated)] sm:right-4 sm:left-auto sm:bottom-4 sm:max-w-sm dark:border-bnc-stone-800 dark:bg-bnc-stone-900"
      role="dialog"
      :aria-label="t('bus.plate')"
    >
      <header class="flex items-start gap-3">
        <span
          class="grid h-10 w-10 shrink-0 place-items-center rounded-full font-mono text-xs font-bold text-white"
          :style="{ background: corridorColor }"
          aria-hidden
        >
          {{ selectedBus.kor || '·' }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500">
            {{ t('bus.corridor') }} {{ selectedBus.kor || '—' }}
          </p>
          <h3 class="truncate font-display text-base font-semibold tracking-tight">
            {{ selectedBus.plate_number || selectedBus.name || '—' }}
          </h3>
          <p class="truncate text-xs text-bnc-stone-500">
            → {{ selectedBus.toward || '—' }}
          </p>
        </div>
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
      </header>

      <dl class="mt-3 grid grid-cols-3 gap-3 border-t border-bnc-stone-200 pt-3 text-xs dark:border-bnc-stone-800">
        <div>
          <dt class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
            {{ t('bus.speed') }}
          </dt>
          <dd class="mt-0.5 font-mono text-base font-bold tabular-nums">
            {{ formatSpeed(selectedBus.speed) }}
            <span class="text-[10px] font-normal text-bnc-stone-500">{{ t('units.kmh') }}</span>
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
        <div>
          <dt class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
            {{ t('bus.nextHalte') }}
          </dt>
          <dd class="mt-0.5 truncate text-sm">
            {{ nextHalte ?? '—' }}
            <span v-if="selectedBus.dist_shel" class="block font-mono text-[10px] text-bnc-stone-500">
              {{ formatDistance(selectedBus.dist_shel) }}
            </span>
          </dd>
        </div>
      </dl>

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
