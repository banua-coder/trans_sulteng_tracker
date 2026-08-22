<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { useFocusStore } from '@/stores/focus'
import { useSocketStore } from '@/stores/socket'
import { isStale } from '@/lib/format'
import CollapsibleSection from '@/components/CollapsibleSection.vue'

const { t } = useI18n()
const brt = useBrtStore()
const city = useCityStore()
const focus = useFocusStore()
const socket = useSocketStore()
const { corridors, halte, buses, loading, error } = storeToRefs(brt)

const stats = computed(() => {
  const fk = focus.kor
  let count = 0
  let speedSum = 0
  let speedN = 0
  for (const b of buses.value.values()) {
    if (fk && b.kor !== fk) continue
    if (isStale(b)) continue
    count++
    if (Number.isFinite(b.speed) && b.speed! > 0) {
      speedSum += b.speed!
      speedN++
    }
  }
  return {
    corridors: corridors.value.length,
    halte: halte.value.length,
    buses: count,
    avgSpeed: speedN ? Math.round(speedSum / speedN) : 0,
  }
})

const cityMeta = computed(() => brt.cityByPref.get(city.pref) ?? null)

function busCountByKor(kor: string): number {
  let n = 0
  for (const b of buses.value.values()) {
    if (b.kor === kor && !isStale(b)) n++
  }
  return n
}

// Intentionally no operating-hours branch. The previous version
// flipped to "Tidak ada bus aktif" (sleeping) based on a hardcoded
// 06–18 WITA window that doesn't match reality — buses sometimes
// run past 18:00. Honest steady state when connected with no
// buses is "still waiting", same string as in BusDataBadge.
const busStatusKey = computed<'connecting' | 'waiting' | null>(() => {
  if (stats.value.buses > 0) return null
  if (socket.state === 'connecting' || socket.state === 'idle') return 'connecting'
  if (socket.state === 'offline') return null
  return 'waiting'
})

const busStatusLabel = computed(() => {
  switch (busStatusKey.value) {
    case 'connecting':
      return t('status.connecting')
    case 'waiting':
      return t('operating.waiting')
    default:
      return ''
  }
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <header class="flex items-start gap-3">
      <span
        v-if="cityMeta?.icon"
        class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-bnc-stone-100 p-1.5 dark:bg-bnc-stone-800"
      >
        <img
          :src="cityMeta.icon"
          :alt="cityMeta.name + ' logo'"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          class="h-full w-full object-contain"
          @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
        />
      </span>
      <div class="min-w-0">
        <h2 class="truncate font-display text-base font-semibold tracking-tight">
          {{ cityMeta?.name ?? city.slug }}
        </h2>
        <p v-if="cityMeta?.city" class="truncate text-xs text-bnc-stone-500">
          {{ cityMeta.city }}
        </p>
      </div>
    </header>

    <dl
      class="grid grid-cols-2 gap-2 rounded-md bg-bnc-stone-100 p-2 text-center font-mono text-[11px] uppercase tracking-wider dark:bg-bnc-stone-800 sm:grid-cols-4"
    >
      <div>
        <dt class="text-bnc-stone-500">Koridor</dt>
        <dd class="text-base font-bold text-bnc-ink dark:text-bnc-paper">{{ stats.corridors }}</dd>
      </div>
      <div>
        <dt class="text-bnc-stone-500">{{ t('bus.listTitle') }}</dt>
        <dd class="text-base font-bold text-bnc-ink dark:text-bnc-paper">{{ stats.buses }}</dd>
      </div>
      <div>
        <dt class="text-bnc-stone-500">{{ t('stats.avg') }}</dt>
        <dd class="text-base font-bold tabular-nums text-bnc-ink dark:text-bnc-paper">
          {{ stats.avgSpeed }}<span class="text-[11px] font-normal text-bnc-stone-500"> {{ t('units.kmh') }}</span>
        </dd>
      </div>
      <div>
        <dt class="text-bnc-stone-500">{{ t('stats.viewers') }}</dt>
        <dd class="text-base font-bold tabular-nums text-bnc-ink dark:text-bnc-paper">{{ socket.viewers }}</dd>
      </div>
    </dl>

    <p
      v-if="busStatusKey"
      class="flex items-center gap-2 rounded-md border border-bnc-stone-200 bg-white px-3 py-2 text-xs text-bnc-stone-600 dark:border-bnc-stone-800 dark:bg-bnc-stone-900 dark:text-bnc-stone-300"
    >
      <span class="live-dot" />
      {{ busStatusLabel }}
    </p>

    <CollapsibleSection name="corridors" title="Koridor" :count="corridors.length">
      <p v-if="loading" class="text-sm text-bnc-stone-500">{{ t('status.connecting') }}</p>
      <p
        v-else-if="error"
        class="rounded-md border border-bnc-stone-300 bg-white p-3 text-sm text-bnc-stone-600 dark:border-bnc-stone-700 dark:bg-bnc-stone-900 dark:text-bnc-stone-300"
      >
        {{ t('errors.loadFailed') }} · {{ error }}
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li v-for="c in corridors" :key="c.id">
          <button
            type="button"
            class="block w-full rounded-md border bg-white p-3 text-left transition-colors hover:border-bnc-stone-300 dark:bg-bnc-stone-900 dark:hover:border-bnc-stone-700"
            :class="
              focus.kor === c.kor
                ? 'border-bnc-ink ring-2 ring-bnc-accent/40 dark:border-bnc-paper'
                : 'border-bnc-stone-200 dark:border-bnc-stone-800'
            "
            :aria-pressed="focus.kor === c.kor"
            @click="focus.kor === c.kor ? focus.clear() : focus.focus(c.kor)"
          >
            <div class="flex items-center gap-2">
              <span
                class="grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[10px] font-extrabold text-white"
                :style="{ background: c.color || '#0EA5E9' }"
                aria-hidden
              >{{ c.kor }}</span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-medium text-bnc-stone-700 dark:text-bnc-stone-200">
                  {{ c.origin }} → {{ c.toward }}
                </p>
                <p class="mt-0.5 font-mono text-[10px] text-bnc-stone-500">
                  {{ c.jam_operasional || '—' }}
                </p>
              </div>
              <span
                class="shrink-0 font-mono text-[10px] font-bold tabular-nums"
                :class="busCountByKor(c.kor) > 0 ? 'text-bnc-accent' : 'text-bnc-stone-400'"
              >
                {{ busCountByKor(c.kor) }} bus
              </span>
            </div>
          </button>
        </li>
      </ul>
    </CollapsibleSection>
  </div>
</template>
