<script setup lang="ts">
/**
 * Printable booklet for a single corridor — one set of pages per
 * leg (A: origin → toward, then B: toward → origin). Each leg's
 * map fits only its own polyline + halte so the zoom is much
 * tighter than rendering both legs in one frame. Per-leg halte
 * data is fetched eagerly on mount; without it the bulk feed
 * leaks reverse halte for some corridors (FD01) and silently
 * drops halte on others (K2A reverse).
 */
import { computed, onMounted } from 'vue'
import { useBrtStore } from '@/stores/brt'
import CorridorMapPage from '@/components/CorridorMapPage.vue'
import type { BrtCorridor, BrtHalte } from '@/types/brt'

const props = defineProps<{
  corridor: BrtCorridor
  cityName: string
  cityIconUrl: string | null
  qrUrl: string
  todayLabel: string
  tileMode: 'map' | 'satellite'
  mobileLayout: boolean
}>()

const brt = useBrtStore()

onMounted(() => {
  const c = props.corridor
  brt.ensureHalteForLeg(c.kor, c.toward, c.origin).catch(() => {})
  brt.ensureHalteForLeg(c.kor, c.origin, c.toward).catch(() => {})
})

function dedupe(list: BrtHalte[]): BrtHalte[] {
  const seen = new Map<string, BrtHalte>()
  for (const h of list) if (!seen.has(h.sh_name)) seen.set(h.sh_name, h)
  return [...seen.values()]
}

const legAHalte = computed(() =>
  dedupe(brt.getHalteForLeg(props.corridor.kor, props.corridor.toward, props.corridor.origin)),
)
const legBHalte = computed(() =>
  dedupe(brt.getHalteForLeg(props.corridor.kor, props.corridor.origin, props.corridor.toward)),
)

const HALTE_PER_PAGE = 20

function chunk(list: BrtHalte[]): BrtHalte[][] {
  if (!list.length) return []
  const out: BrtHalte[][] = []
  for (let i = 0; i < list.length; i += HALTE_PER_PAGE) {
    out.push(list.slice(i, i + HALTE_PER_PAGE))
  }
  return out
}

interface PageSpec {
  leg: 'a' | 'b'
  legHalte: BrtHalte[]
  legChunks: BrtHalte[][]
  chunk: BrtHalte[]
  legPageNum: number
  legPageTotal: number
  isLastOverall: boolean
}

const pages = computed<PageSpec[]>(() => {
  const a = legAHalte.value
  const b = legBHalte.value
  const aChunks = chunk(a)
  const bChunks = chunk(b)
  const out: Omit<PageSpec, 'isLastOverall'>[] = []
  aChunks.forEach((ch, i) => out.push({
    leg: 'a', legHalte: a, legChunks: aChunks, chunk: ch,
    legPageNum: i + 1, legPageTotal: aChunks.length,
  }))
  bChunks.forEach((ch, i) => out.push({
    leg: 'b', legHalte: b, legChunks: bChunks, chunk: ch,
    legPageNum: i + 1, legPageTotal: bChunks.length,
  }))
  return out.map((p, i) => ({ ...p, isLastOverall: i === out.length - 1 }))
})
</script>

<template>
  <CorridorMapPage
    v-for="(p, i) in pages"
    :key="corridor.kor + '-' + p.leg + '-' + i"
    :corridor="corridor"
    :leg="p.leg"
    :leg-halte="p.legHalte"
    :chunk="p.chunk"
    :leg-page-num="p.legPageNum"
    :leg-page-total="p.legPageTotal"
    :city-name="cityName"
    :city-icon-url="cityIconUrl"
    :qr-url="qrUrl"
    :today-label="todayLabel"
    :show-legend-extras="p.isLastOverall"
    :tile-mode="tileMode"
    :mobile-layout="mobileLayout"
  />
</template>
