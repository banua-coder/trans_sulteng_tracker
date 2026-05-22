<script setup lang="ts">
/**
 * Printable booklet for a single corridor. Splits the halte list into
 * chunks of HALTE_PER_PAGE and renders one CorridorMapPage per chunk.
 * Every page repeats the corridor map and the same numbering scheme,
 * so the reader can flip between pages without losing context. The
 * Keterangan + QR block only appears on the LAST page to save room
 * on the earlier ones.
 */
import { computed } from 'vue'
import { useBrtStore } from '@/stores/brt'
import CorridorMapPage from '@/components/CorridorMapPage.vue'
import type { BrtCorridor, BrtHalte } from '@/types/brt'

const props = defineProps<{
  corridor: BrtCorridor
  halte: BrtHalte[]
  cityName: string
  cityIconUrl: string | null
  qrUrl: string
  todayLabel: string
}>()

const brt = useBrtStore()

// Halte ordered along the forward leg (origin → toward) using the
// per-leg authoritative data. The bulk feed's insertion order can be
// reversed for some corridors (FD01 Donggala) so always derive from
// getHalteForLeg, then append any reverse-only halte (K1 reverse
// terminus, K2A reverse) that don't appear forward.
const allHalte = computed(() => {
  const c = props.corridor
  const fwd = brt.getHalteForLeg(c.kor, c.toward, c.origin)
  const rev = brt.getHalteForLeg(c.kor, c.origin, c.toward)
  const seen = new Map<string, BrtHalte>()
  for (const h of fwd) if (!seen.has(h.sh_name)) seen.set(h.sh_name, h)
  for (const h of rev) if (!seen.has(h.sh_name)) seen.set(h.sh_name, h)
  return [...seen.values()]
})

// Empirical fit for the side column on A4 landscape after header,
// keterangan and QR block. 20 fits comfortably.
const HALTE_PER_PAGE = 20

const pages = computed(() => {
  const list = allHalte.value
  if (!list.length) return [list]
  const out: BrtHalte[][] = []
  for (let i = 0; i < list.length; i += HALTE_PER_PAGE) {
    out.push(list.slice(i, i + HALTE_PER_PAGE))
  }
  return out
})
</script>

<template>
  <CorridorMapPage
    v-for="(chunk, i) in pages"
    :key="corridor.kor + '-' + i"
    :corridor="corridor"
    :all-halte="allHalte"
    :chunk="chunk"
    :city-name="cityName"
    :city-icon-url="cityIconUrl"
    :qr-url="qrUrl"
    :today-label="todayLabel"
    :page="i + 1"
    :total-pages="pages.length"
    :show-legend-extras="i === pages.length - 1"
  />
</template>
