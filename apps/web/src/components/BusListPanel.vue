<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useFocusStore } from '@/stores/focus'
import { useSelectionStore } from '@/stores/selection'
import { useUiStore } from '@/stores/ui'
import { ageSeconds, formatAge, formatSpeed, isStale } from '@/lib/format'
import type { BrtBus } from '@/types/brt'
import CollapsibleSection from '@/components/CollapsibleSection.vue'

const { t } = useI18n()
const brt = useBrtStore()
const selection = useSelectionStore()
const focus = useFocusStore()
const ui = useUiStore()
const { buses, halte } = storeToRefs(brt)
const { busSearch: search } = storeToRefs(ui)

const tick = ref(0)
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => (tick.value += 1), 5_000)
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

const halteById = computed(() => {
  const m = new Map<string, string>()
  for (const h of halte.value) m.set(h.sh_id, h.sh_name)
  return m
})

interface Row {
  bus: BrtBus
  label: string
  age: number | null
  stale: boolean
  color: string
  nextHalteName: string | null
  armada: string | null
  plate: string | null
}

const rows = computed<Row[]>(() => {
  void tick.value // re-evaluate "ago" labels every 5s
  const fk = focus.kor
  const q = search.value.trim().toLowerCase()
  const out: Row[] = []
  for (const bus of buses.value.values()) {
    if (fk && bus.kor !== fk) continue
    const armada = bus.name?.trim() || null
    const plate = bus.plate_number?.trim() || null
    const label = plate || armada || bus.kor || '—'
    const nextHalteName = bus.new_shel_t ? halteById.value.get(bus.new_shel_t) ?? null : null

    if (q) {
      const haystack = [
        armada ?? '',
        plate ?? '',
        bus.kor ?? '',
        bus.toward ?? '',
        nextHalteName ?? '',
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) continue
    }

    out.push({
      bus,
      label,
      age: ageSeconds(bus.dt_tracker),
      stale: isStale(bus),
      color: brt.colorForKor(bus.kor) || '#0EA5E9',
      nextHalteName,
      armada,
      plate,
    })
  }
  // Fresh first; within fresh sort by latest receivedAt; stale at the bottom.
  out.sort((a, b) => {
    if (a.stale !== b.stale) return a.stale ? 1 : -1
    return (b.bus._receivedAt ?? 0) - (a.bus._receivedAt ?? 0)
  })
  return out
})

const totalCount = computed(() => {
  const fk = focus.kor
  if (!fk) return buses.value.size
  let n = 0
  for (const bus of buses.value.values()) if (bus.kor === fk) n++
  return n
})

function pick(bus: BrtBus) {
  selection.selectBus(bus.imei || bus.id)
}
</script>

<template>
  <CollapsibleSection name="buses" :title="t('bus.listTitle')" :count="totalCount">
    <label class="relative block">
      <span class="sr-only">{{ t('bus.search') }}</span>
      <input
        v-model="search"
        type="search"
        autocomplete="off"
        :placeholder="t('bus.search')"
        class="w-full rounded-md border border-bnc-stone-200 bg-white px-3 py-1.5 pr-8 font-mono text-xs placeholder:text-bnc-stone-400 focus:border-bnc-accent focus:outline-none dark:border-bnc-stone-800 dark:bg-bnc-stone-900"
      />
      <svg
        v-if="!search"
        class="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-bnc-stone-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <button
        v-else
        type="button"
        class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-bnc-stone-500 hover:bg-bnc-stone-100 dark:hover:bg-bnc-stone-800"
        :aria-label="'Clear'"
        @click="search = ''"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
    </label>

    <p
      v-if="!totalCount"
      class="mt-2 rounded-md bg-bnc-stone-100 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500 dark:bg-bnc-stone-800"
    >
      {{ t('bus.empty') }}
    </p>
    <p
      v-else-if="!rows.length"
      class="mt-2 rounded-md bg-bnc-stone-100 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500 dark:bg-bnc-stone-800"
    >
      {{ t('bus.noMatch') }}
    </p>

    <ul v-else class="mt-2 flex flex-col gap-1.5">
      <li v-for="r in rows" :key="r.bus.imei || r.bus.id">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-md border border-bnc-stone-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-900 dark:hover:border-bnc-stone-700"
          @click="pick(r.bus)"
        >
          <span
            class="grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold text-white"
            :style="{ background: r.color, opacity: r.stale ? 0.55 : 1 }"
            aria-hidden
          >
            {{ r.bus.kor || '·' }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span
                v-if="r.armada"
                class="inline-flex items-center rounded bg-bnc-stone-100 px-1 py-[1px] font-mono text-[9px] font-bold tracking-wider dark:bg-bnc-stone-800"
              >
                {{ r.armada }}
              </span>
              <p class="truncate font-display text-sm font-semibold tracking-tight">
                {{ r.plate || r.bus.kor || '—' }}
              </p>
            </div>
            <p class="truncate font-mono text-[10px] text-bnc-stone-500">
              {{ r.nextHalteName ?? r.bus.toward ?? '—' }}
            </p>
          </div>
          <div class="ml-auto text-right">
            <p class="font-mono text-xs tabular-nums">
              {{ formatSpeed(r.bus.speed) }}
              <span class="text-[9px] text-bnc-stone-500">{{ t('units.kmh') }}</span>
            </p>
            <p
              class="font-mono text-[10px] tabular-nums"
              :class="r.stale ? 'text-bnc-stone-500' : 'text-bnc-stone-400'"
            >
              {{ formatAge(r.age) }} {{ t('units.ago') }}
            </p>
          </div>
        </button>
      </li>
    </ul>
  </CollapsibleSection>
</template>
