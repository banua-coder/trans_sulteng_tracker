<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useBrtStore } from '@/stores/brt'
import { useCityStore } from '@/stores/city'
import { useSocketStore } from '@/stores/socket'

const city = useCityStore()
const brt = useBrtStore()
const socket = useSocketStore()

const { corridors, halte, buses, loading, error } = storeToRefs(brt)

const busCount = computed(() => buses.value.size)

watch(
  () => city.pref,
  async (pref) => {
    brt.clearBuses()
    await brt.loadRoutes(pref)
    socket.connect(pref)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  socket.disconnect()
})
</script>

<template>
  <div class="grid h-[calc(100dvh-var(--header-h)-32px)] grid-cols-1 lg:grid-cols-[var(--sidebar-w)_1fr]">
    <aside
      class="hidden border-r border-bnc-stone-200 bg-bnc-stone-50/60 p-4 lg:block dark:border-bnc-stone-800 dark:bg-bnc-stone-900/40"
    >
      <p class="font-mono text-[11px] uppercase tracking-[0.2em] text-bnc-stone-500">
        {{ city.slug }} · pref {{ city.pref }}
      </p>
      <h2 class="mt-2 font-display text-xl font-semibold tracking-tight">
        Koridor
      </h2>
      <p v-if="loading" class="mt-3 text-sm text-bnc-stone-500">Memuat…</p>
      <p v-else-if="error" class="mt-3 text-sm text-bnc-stone-600">{{ error }}</p>
      <ul v-else class="mt-3 flex flex-col gap-2">
        <li
          v-for="c in corridors"
          :key="c.id"
          class="rounded-md border border-bnc-stone-200 bg-white p-3 dark:border-bnc-stone-800 dark:bg-bnc-stone-900"
        >
          <div class="flex items-center gap-2">
            <span
              class="h-2 w-6 rounded-full"
              :style="{ background: c.color || '#0EA5E9' }"
              aria-hidden
            />
            <span class="font-mono text-xs font-bold uppercase">{{ c.kor }}</span>
            <span class="ml-auto font-mono text-[11px] text-bnc-stone-500">
              {{ c.jam_operasional }}
            </span>
          </div>
          <p class="mt-1 text-xs text-bnc-stone-600 dark:text-bnc-stone-300">
            {{ c.origin }} → {{ c.toward }}
          </p>
        </li>
      </ul>
    </aside>

    <section class="relative grid place-items-center bg-bnc-stone-100 dark:bg-bnc-stone-900">
      <!-- Map placeholder until T3.2 lands -->
      <div class="text-center">
        <p class="font-mono text-[11px] uppercase tracking-[0.2em] text-bnc-stone-500">
          map · pending
        </p>
        <p class="mt-2 font-display text-xl tracking-tight">
          {{ corridors.length }} koridor · {{ halte.length }} halte · {{ busCount }} bus aktif
        </p>
        <p class="mt-2 text-sm text-bnc-stone-500">
          Peta interaktif akan tampil di sini setelah T3.2 selesai.
        </p>
      </div>
    </section>
  </div>
</template>
