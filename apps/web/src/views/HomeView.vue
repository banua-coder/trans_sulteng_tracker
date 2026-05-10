<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { api } from '@/lib/api'
import type { BrtCity, CitySlug } from '@/types/brt'
import { CITY_PREF, PREF_CITY } from '@/types/brt'
import BanuacoderIcon from '@/components/BanuacoderIcon.vue'
import { VERSION_LABEL } from '@/lib/version'

const { t } = useI18n()

interface CityCard {
  slug: CitySlug
  pref: string
  name: string
  city: string
  blurb: string
  icon: string | null
  accent: string
}

const FALLBACK: CityCard[] = [
  {
    slug: 'palu',
    pref: CITY_PREF.palu,
    name: 'TransPalu',
    city: 'Kota Palu',
    blurb: '9 koridor · 301 halte',
    icon: null,
    accent: '#1D9CD4',
  },
  {
    slug: 'donggala',
    pref: CITY_PREF.donggala,
    name: 'Trans Donggala',
    city: 'Kabupaten Donggala',
    blurb: '3 koridor · 47 halte',
    icon: null,
    accent: '#12398C',
  },
]

const ACCENTS: Record<string, string> = {
  '12': '#1D9CD4',
  '11': '#12398C',
}

const cards = ref<CityCard[]>(FALLBACK)
const error = ref<string | null>(null)

function isOurPref(p: string): p is CitySlug extends never ? never : keyof typeof PREF_CITY {
  return p in PREF_CITY
}

onMounted(async () => {
  try {
    const list = await api.cities()
    if (!Array.isArray(list)) return
    const ours = list
      .filter((c): c is BrtCity => Boolean(c?.pref) && isOurPref(c.pref))
      .map<CityCard>((c) => {
        const slug = PREF_CITY[c.pref]
        const fallback = FALLBACK.find((f) => f.slug === slug)
        return {
          slug,
          pref: c.pref,
          name: c.name || fallback?.name || slug,
          city: c.city || fallback?.city || '',
          blurb: fallback?.blurb ?? '',
          icon: c.icon || null,
          accent: ACCENTS[c.pref] ?? fallback?.accent ?? '#1D9CD4',
        }
      })
    if (ours.length) {
      // keep our canonical ordering: palu first, then donggala
      ours.sort((a, b) => FALLBACK.findIndex((f) => f.slug === a.slug) - FALLBACK.findIndex((f) => f.slug === b.slug))
      cards.value = ours
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

const year = computed(() => new Date().getFullYear())
</script>

<template>
  <section class="container mx-auto max-w-[var(--container-max)] px-6 py-12 sm:py-16">
    <p class="font-mono text-[11px] uppercase tracking-[0.2em] text-bnc-stone-500">
      cektrans · realtime
    </p>
    <h1
      class="mt-3 max-w-3xl font-display text-[clamp(2rem,1.4rem+2.5vw,3.4rem)] font-semibold leading-[1.05] tracking-tight"
    >
      {{ t('brand.tagline') }}
    </h1>
    <p class="mt-4 max-w-prose text-bnc-stone-600 dark:text-bnc-stone-300">
      Tahu kapan bus tiba — sebelum kamu jalan ke halte. Posisi langsung
      dari sistem resmi Mitra Darat, diperbarui setiap detik.
    </p>

    <div class="mt-10 grid gap-4 sm:grid-cols-2">
      <RouterLink
        v-for="c in cards"
        :key="c.slug"
        :to="{ name: 'city', params: { city: c.slug } }"
        class="group relative flex flex-col justify-between gap-6 overflow-hidden rounded-[var(--radius-lg)] border border-bnc-stone-200 bg-white p-6 shadow-[var(--shadow-subtle)] transition-shadow hover:shadow-[var(--shadow-elevated)] dark:border-bnc-stone-800 dark:bg-bnc-stone-900"
      >
        <span
          class="absolute inset-x-0 top-0 h-1"
          :style="{ background: c.accent }"
          aria-hidden
        />
        <div class="flex items-start gap-4">
          <span
            v-if="c.icon"
            class="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-bnc-stone-100 p-2 dark:bg-bnc-stone-800"
          >
            <img
              :src="c.icon"
              :alt="c.name + ' logo'"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              class="h-full w-full object-contain"
              @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
            />
          </span>
          <div class="min-w-0 flex-1">
            <p
              v-if="c.city"
              class="font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500"
            >
              {{ c.city }}
            </p>
            <h2 class="mt-1 font-display text-2xl font-semibold tracking-tight">
              {{ c.name }}
            </h2>
            <p class="mt-1 text-sm text-bnc-stone-600 dark:text-bnc-stone-300">
              {{ c.blurb }}
            </p>
          </div>
        </div>
        <span
          class="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-bnc-stone-600 transition-transform group-hover:translate-x-1 dark:text-bnc-stone-300"
        >
          Lacak sekarang
          <svg
            class="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </span>
      </RouterLink>
    </div>

    <p
      v-if="error"
      class="mt-6 rounded-md border border-bnc-stone-200 bg-bnc-stone-50 p-3 font-mono text-[11px] text-bnc-stone-500 dark:border-bnc-stone-800 dark:bg-bnc-stone-900"
    >
      Gagal mengambil data realtime · menampilkan ringkasan statis
    </p>

    <footer class="mt-16 flex flex-col gap-3 border-t border-bnc-stone-200 pt-6 text-xs text-bnc-stone-500 sm:flex-row sm:items-center sm:justify-between dark:border-bnc-stone-800">
      <div class="flex flex-col gap-1">
        <p>{{ t('footer.data') }}</p>
        <p class="select-text font-mono text-[10px] tabular-nums text-bnc-stone-400">
          {{ VERSION_LABEL }}
        </p>
      </div>
      <a
        href="https://banuacoder.com"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-2 text-bnc-ink transition-opacity hover:opacity-80 dark:text-bnc-paper"
        aria-label="Banua Coder · banuacoder.com"
      >
        <BanuacoderIcon :size="22" />
        <span class="font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500">
          © {{ year }} Banuacoder
        </span>
      </a>
    </footer>
  </section>
</template>
