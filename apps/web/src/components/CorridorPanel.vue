<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { useFocusStore } from '@/stores/focus'
import { useSocketStore } from '@/stores/socket'
import { operatingState } from '@/lib/operating'

const { t } = useI18n()
const brt = useBrtStore()
const city = useCityStore()
const focus = useFocusStore()
const socket = useSocketStore()
const { corridors, halte, buses, loading, error } = storeToRefs(brt)

const stats = computed(() => ({
  corridors: corridors.value.length,
  halte: halte.value.length,
  buses: buses.value.size,
}))

const cityMeta = computed(() => brt.cityByPref.get(city.pref) ?? null)

const busStatusKey = computed<'connecting' | 'waiting' | 'sleeping' | null>(() => {
  if (stats.value.buses > 0) return null
  if (socket.state === 'connecting' || socket.state === 'idle') return 'connecting'
  if (socket.state === 'offline') return null
  // socket is 'live' but the bus map is empty.
  return operatingState().active ? 'waiting' : 'sleeping'
})

const busStatusLabel = computed(() => {
  switch (busStatusKey.value) {
    case 'connecting':
      return t('status.connecting')
    case 'waiting':
      return t('operating.waiting')
    case 'sleeping':
      return t('operating.none')
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
        <p class="font-mono text-[11px] uppercase tracking-[0.2em] text-bnc-stone-500">
          pref {{ city.pref }}
        </p>
        <h2 class="mt-0.5 truncate font-display text-base font-semibold tracking-tight">
          {{ cityMeta?.name ?? city.slug }}
        </h2>
        <p v-if="cityMeta?.city" class="truncate text-xs text-bnc-stone-500">
          {{ cityMeta.city }}
        </p>
      </div>
    </header>

    <dl
      class="grid grid-cols-3 gap-2 rounded-md bg-bnc-stone-100 p-2 text-center font-mono text-[11px] uppercase tracking-wider dark:bg-bnc-stone-800"
    >
      <div>
        <dt class="text-bnc-stone-500">Koridor</dt>
        <dd class="text-base font-bold text-bnc-ink dark:text-bnc-paper">{{ stats.corridors }}</dd>
      </div>
      <div>
        <dt class="text-bnc-stone-500">Halte</dt>
        <dd class="text-base font-bold text-bnc-ink dark:text-bnc-paper">{{ stats.halte }}</dd>
      </div>
      <div>
        <dt class="text-bnc-stone-500">Bus</dt>
        <dd class="text-base font-bold text-bnc-ink dark:text-bnc-paper">{{ stats.buses }}</dd>
      </div>
    </dl>

    <p
      v-if="busStatusKey"
      class="flex items-center gap-2 rounded-md border border-bnc-stone-200 bg-white px-3 py-2 text-xs text-bnc-stone-600 dark:border-bnc-stone-800 dark:bg-bnc-stone-900 dark:text-bnc-stone-300"
    >
      <span
        class="live-dot"
        :style="
          busStatusKey === 'sleeping'
            ? { background: 'var(--color-stale)', animation: 'none' }
            : undefined
        "
      />
      {{ busStatusLabel }}
    </p>

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
              class="h-2 w-8 shrink-0 rounded-full"
              :style="{ background: c.color || '#0EA5E9' }"
              aria-hidden
            />
            <span class="font-mono text-xs font-bold uppercase">{{ c.kor }}</span>
            <span class="ml-auto truncate font-mono text-[11px] text-bnc-stone-500">
              {{ c.jam_operasional || '—' }}
            </span>
          </div>
          <p class="mt-1 truncate text-xs text-bnc-stone-600 dark:text-bnc-stone-300">
            {{ c.origin }} → {{ c.toward }}
          </p>
        </button>
      </li>
    </ul>
  </div>
</template>
