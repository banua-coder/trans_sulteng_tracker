<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useGeoStore } from '@/stores/geo'
import { useSelectionStore } from '@/stores/selection'
import { etaMinutes, formatDistance, haversineMeters, isStale } from '@/lib/format'
import type { BrtBus, BrtHalte } from '@/types/brt'
import CollapsibleSection from '@/components/CollapsibleSection.vue'

const { t } = useI18n()
const brt = useBrtStore()
const geo = useGeoStore()
const selection = useSelectionStore()
const { halte, buses } = storeToRefs(brt)

const tick = ref(0)
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => (tick.value += 1), 15_000)
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

interface Row {
  halte: BrtHalte
  meters: number
  next: BrtBus | null
  etaMin: number | null
}

const rows = computed<Row[]>(() => {
  void tick.value
  const pos = geo.position
  if (!pos) return []
  const all = halte.value
  const ranked: Row[] = []
  for (const h of all) {
    const lat = parseFloat(h.sh_lat)
    const lng = parseFloat(h.sh_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const meters = haversineMeters(pos, { lat, lng })
    if (meters > 5_000) continue // 5km radius cap
    let next: BrtBus | null = null
    let bestEta: number | null = null
    for (const bus of buses.value.values()) {
      if (bus.kor !== h.kor) continue
      if (bus.new_shel_t !== h.sh_id) continue
      if (isStale(bus)) continue
      const eta = etaMinutes(bus.dist_shel ?? null, bus.speed ?? null)
      if (
        next === null ||
        (eta != null && (bestEta == null || eta < bestEta))
      ) {
        next = bus
        bestEta = eta
      }
    }
    ranked.push({ halte: h, meters, next, etaMin: bestEta })
  }
  ranked.sort((a, b) => a.meters - b.meters)
  return ranked.slice(0, 5)
})

function pick(h: BrtHalte) {
  selection.selectHalte(h.sh_id)
}
</script>

<template>
  <transition name="nearby">
    <CollapsibleSection
      v-if="geo.isGranted && rows.length"
      name="nearby"
      :title="t('nearby.title')"
      :count="rows.length"
    >
      <template #leading>
        <span class="grid h-5 w-5 place-items-center rounded-full bg-bnc-accent/15 text-bnc-accent">
          <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
          </svg>
        </span>
      </template>
      <ul class="flex flex-col gap-1.5">
        <li v-for="r in rows" :key="r.halte.sh_id">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-md border border-bnc-stone-200 bg-white px-2.5 py-2 text-left transition-all hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-900 dark:hover:border-bnc-stone-700"
            @click="pick(r.halte)"
          >
            <span
              class="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white"
              :style="{ background: brt.colorForKor(r.halte.kor) || '#0EA5E9', boxShadow: '0 0 0 1px ' + (brt.colorForKor(r.halte.kor) || '#0EA5E9') }"
              aria-hidden
            />
            <div class="min-w-0 flex-1">
              <p class="truncate font-display text-sm font-semibold tracking-tight">
                {{ r.halte.sh_name }}
              </p>
              <p class="truncate font-mono text-[10px] text-bnc-stone-500">
                {{ r.halte.kor }} · {{ formatDistance(r.meters) }}
              </p>
            </div>
            <span
              v-if="r.etaMin != null"
              class="font-mono text-xs tabular-nums text-bnc-ink dark:text-bnc-paper"
            >
              ~ {{ Math.max(1, Math.round(r.etaMin)) }}m
            </span>
            <span
              v-else-if="r.next?.speed === 0"
              class="font-mono text-[10px] uppercase text-bnc-stone-500"
            >
              approaching
            </span>
            <span v-else class="font-mono text-[10px] uppercase text-bnc-stone-500">
              —
            </span>
          </button>
        </li>
      </ul>
    </CollapsibleSection>
  </transition>
</template>

<style scoped>
.nearby-enter-active,
.nearby-leave-active {
  transition: opacity 250ms ease, transform 280ms ease, max-height 280ms ease;
  overflow: hidden;
  max-height: 600px;
}
.nearby-enter-from,
.nearby-leave-to {
  opacity: 0;
  transform: translateY(-6px);
  max-height: 0;
}
</style>
