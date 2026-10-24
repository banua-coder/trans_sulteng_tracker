<script setup lang="ts">
/**
 * Full searchable halte list for the desktop sidebar's Halte tab,
 * with the corridor filter chips. NearbyHaltePanel alone is empty
 * until the browser shares a location, so it cannot be the whole tab.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useSelectionStore } from '@/stores/selection'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const brt = useBrtStore()
const selection = useSelectionStore()
const ui = useUiStore()
const { corridorPills, error } = storeToRefs(brt)
const { busSearch, halteListFilterKor } = storeToRefs(ui)

const filteredHalte = brt.halteListFor(busSearch, halteListFilterKor)

const emptyMessage = computed(() =>
  error.value ? `${t('errors.loadFailed')} \u00b7 ${error.value}` : t('route.empty'),
)

function pickHalte(shId: string) {
  selection.selectHalte(shId)
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <label class="relative block">
      <span class="sr-only">{{ t('route.searchHalte') }}</span>
      <input
        v-model="busSearch"
        type="search"
        autocomplete="off"
        :placeholder="t('route.searchHalte')"
        class="w-full rounded-[var(--radius-md)] border border-bnc-stone-200 bg-bnc-stone-50 px-3 py-2 text-sm placeholder:text-bnc-stone-400 focus:border-bnc-accent focus:outline-none dark:border-bnc-stone-800 dark:bg-bnc-stone-800"
      />
    </label>
      <div
        class="flex items-center gap-1.5 pb-1"
        data-tour="halte-filter"
      >
        <button
          type="button"
          class="inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
          :class="
            halteListFilterKor === null
              ? 'border-bnc-ink bg-bnc-ink text-bnc-paper dark:border-bnc-paper dark:bg-bnc-paper dark:text-bnc-ink'
              : 'border-bnc-stone-300 bg-white text-bnc-stone-600 hover:bg-bnc-stone-100 dark:border-bnc-stone-700 dark:bg-bnc-stone-900 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800'
          "
          @click="ui.setHalteListFilter(null)"
        >
          {{ t('halte.showAll') }}
        </button>
        <div
          class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&amp;::-webkit-scrollbar]:hidden"
        >
          <button
            v-for="p in corridorPills"
            :key="p.kor"
            type="button"
            class="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white transition-opacity"
            :style="{
              background: p.color,
              opacity: halteListFilterKor === null || halteListFilterKor === p.kor ? 1 : 0.4,
            }"
            :aria-pressed="halteListFilterKor === p.kor"
            @click="ui.toggleHalteListFilter(p.kor)"
          >
            {{ p.kor }}
          </button>
        </div>
      </div>

      <ul class="flex flex-col gap-2">
        <li v-for="h in filteredHalte" :key="h.sh_name">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-bnc-stone-200 bg-white px-3 py-3 text-left transition-colors hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-900 dark:hover:border-bnc-stone-700"
            @click="pickHalte(h.sh_id)"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate font-display text-sm font-semibold tracking-tight">
                {{ h.sh_name }}
              </p>
              <div class="mt-1 flex flex-wrap gap-1">
                <span
                  v-for="b in brt.corridorBadgesForHalte(h, halteListFilterKor)"
                  :key="b.kor"
                  class="inline-flex items-center rounded px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-wider text-white transition-opacity"
                  :style="{ background: b.color, opacity: halteListFilterKor === null || b.current ? 1 : 0.45 }"
                >
                  {{ b.kor }}
                </span>
              </div>
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
          {{ emptyMessage }}
        </li>
      </ul>
  </div>
</template>
