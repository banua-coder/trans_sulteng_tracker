<script setup lang="ts">
/**
 * Mobile-first "Rute & Halte" browser, adapted from the TJ
 * Transjakarta app's "Route & Bus Stop" screen.
 *
 * - Two tabs: RUTE (corridors) and HALTE (stops)
 * - Search filters either set by name or kor / sh_id
 * - Tapping a route → `/:city/routes/:kor` (timeline)
 * - Tapping a halte → `/:city?halte=:sh_id` (back to main map deep-linked)
 *
 * Desktop users can still hit this URL; the layout reads fine in
 * either orientation, but the CityView remains the primary desktop
 * experience.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import RouteListItem from '@/components/RouteListItem.vue'

const props = defineProps<{ city: string }>()

const { t } = useI18n()
const router = useRouter()
const brt = useBrtStore()
const city = useCityStore()
const { corridors, halte } = storeToRefs(brt)

type Tab = 'routes' | 'halte'
const tab = ref<Tab>('routes')
const search = ref('')

onMounted(async () => {
  // Ensure data is loaded if the user landed here directly (no
  // CityView in front of us to do the prefetch).
  if (!brt.corridors.length || !brt.halte.length) {
    await brt.loadRoutes(city.pref)
  }
})

const filteredRoutes = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = corridors.value.filter((c) => c.pref === city.pref)
  if (!q) return list
  return list.filter((c) =>
    [c.kor, c.origin, c.toward].filter(Boolean).join(' ').toLowerCase().includes(q),
  )
})

const filteredHalte = computed(() => {
  const q = search.value.trim().toLowerCase()
  // Dedupe by sh_id — the upstream returns the same halte once per
  // direction; we just need one row per physical stop.
  const seen = new Map<string, (typeof halte.value)[number]>()
  for (const h of halte.value) {
    if (!seen.has(h.sh_id)) seen.set(h.sh_id, h)
  }
  const list = [...seen.values()]
  if (!q) return list
  return list.filter((h) =>
    [h.sh_name, h.kor, h.sh_id].filter(Boolean).join(' ').toLowerCase().includes(q),
  )
})

function pickRoute(kor: string) {
  router.push({ name: 'route-detail', params: { city: props.city, kor } })
}

function pickHalte(shId: string) {
  router.push({ name: 'city', params: { city: props.city }, query: { halte: shId } })
}

function close() {
  router.push({ name: 'city', params: { city: props.city } })
}
</script>

<template>
  <section class="mx-auto flex h-full max-w-2xl flex-col bg-bnc-paper dark:bg-bnc-ink">
    <!-- header -->
    <header class="flex shrink-0 items-center justify-between gap-3 px-4 pt-4">
      <h1 class="font-display text-xl font-bold tracking-tight">
        {{ t('route.indexTitle') }}
      </h1>
      <button
        type="button"
        class="grid h-9 w-9 place-items-center rounded-full border border-bnc-stone-200 bg-white text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:border-bnc-stone-800 dark:bg-bnc-stone-900 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
        :aria-label="t('a11y.close')"
        @click="close"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
    </header>

    <!-- tabs -->
    <div class="mt-4 flex shrink-0 gap-2 px-4">
      <button
        type="button"
        class="flex-1 rounded-full px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors"
        :class="
          tab === 'routes'
            ? 'bg-bnc-primary text-white shadow-sm'
            : 'bg-bnc-stone-100 text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300'
        "
        @click="tab = 'routes'"
      >
        {{ t('route.tabRoute') }}
      </button>
      <button
        type="button"
        class="flex-1 rounded-full px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors"
        :class="
          tab === 'halte'
            ? 'bg-bnc-primary text-white shadow-sm'
            : 'bg-bnc-stone-100 text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300'
        "
        @click="tab = 'halte'"
      >
        {{ t('route.tabHalte') }}
      </button>
    </div>

    <!-- search -->
    <label class="relative mt-3 block shrink-0 px-4">
      <span class="sr-only">{{ t('route.search') }}</span>
      <input
        v-model="search"
        type="search"
        autocomplete="off"
        :placeholder="tab === 'routes' ? t('route.searchRoute') : t('route.searchHalte')"
        class="w-full rounded-[var(--radius-md)] border border-bnc-stone-200 bg-bnc-stone-50 px-4 py-3 pr-10 text-sm placeholder:text-bnc-stone-400 focus:border-bnc-accent focus:outline-none dark:border-bnc-stone-800 dark:bg-bnc-stone-900"
      />
      <svg
        class="pointer-events-none absolute right-7 top-1/2 h-4 w-4 -translate-y-1/2 text-bnc-stone-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    </label>

    <!-- list -->
    <div class="mt-3 flex-1 overflow-y-auto px-4 pb-6">
      <ul v-if="tab === 'routes'" class="flex flex-col gap-2">
        <li v-for="c in filteredRoutes" :key="c.kor">
          <button type="button" class="w-full" @click="pickRoute(c.kor)">
            <RouteListItem
              :kor="c.kor"
              :color="c.color || '#1D9CD4'"
              :origin="c.origin"
              :toward="c.toward"
            />
          </button>
        </li>
        <li
          v-if="!filteredRoutes.length"
          class="rounded-md bg-bnc-stone-100 px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500 dark:bg-bnc-stone-800"
        >
          {{ t('route.empty') }}
        </li>
      </ul>

      <ul v-else class="flex flex-col gap-2">
        <li v-for="h in filteredHalte" :key="h.sh_id">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-bnc-stone-200 bg-white px-3 py-3 text-left transition-colors hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-900 dark:hover:border-bnc-stone-700"
            @click="pickHalte(h.sh_id)"
          >
            <span
              class="h-3 w-3 shrink-0 rounded-full border-2 border-white"
              :style="{ background: brt.colorForKor(h.kor), boxShadow: '0 0 0 1px ' + brt.colorForKor(h.kor) }"
              aria-hidden
            />
            <div class="min-w-0 flex-1">
              <p class="truncate font-display text-sm font-semibold tracking-tight">
                {{ h.sh_name }}
              </p>
              <p class="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
                {{ h.kor }} · {{ h.origin }} → {{ h.toward }}
              </p>
            </div>
            <svg
              class="h-4 w-4 shrink-0 text-bnc-stone-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </li>
        <li
          v-if="!filteredHalte.length"
          class="rounded-md bg-bnc-stone-100 px-3 py-3 font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500 dark:bg-bnc-stone-800"
        >
          {{ t('route.empty') }}
        </li>
      </ul>
    </div>
  </section>
</template>
