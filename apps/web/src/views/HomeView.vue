<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { api } from '@/lib/api'
import type { BrtCity, CitySlug } from '@/types/brt'
import { CITY_PREF, PREF_CITY } from '@/types/brt'
import BanuacoderIcon from '@/components/BanuacoderIcon.vue'
import LandingRouteArt from '@/components/LandingRouteArt.vue'
import SidebarIcon from '@/components/SidebarIcon.vue'
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

const features = [
  {
    icon: 'buses' as const,
    title: 'Lacak bus langsung',
    body: 'Lihat posisi setiap bus di peta dan kapan ia tiba di halte terdekatmu.',
  },
  {
    icon: 'plan' as const,
    title: 'Rencana perjalanan',
    body: 'Pilih asal dan tujuan, dapatkan koridor, titik naik dan turun, serta waktu tempuh.',
  },
  {
    icon: 'companion' as const,
    title: 'Pendamping perjalanan',
    body: 'Diingatkan saat harus bersiap naik, turun, atau pindah koridor selama di jalan.',
  },
  {
    icon: 'download' as const,
    title: 'Peta koridor untuk dicetak',
    body: 'Unduh peta tiap koridor lengkap dengan daftar halte, siap dibawa atau dibagikan.',
  },
]

const year = computed(() => new Date().getFullYear())
</script>

<template>
  <div class="container mx-auto max-w-[var(--container-max)] px-6">
    <!-- 1. Hero -->
    <section class="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <transition name="hero-rise" appear>
          <p style="--reveal-i: 0" class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500">
            <span class="live-dot" aria-hidden />
            Realtime · Palu &amp; Donggala
          </p>
        </transition>
        <transition name="hero-rise" appear>
          <h1
            style="--reveal-i: 1"
            class="mt-3 max-w-3xl font-display text-[clamp(2.2rem,1.5rem+3vw,3.8rem)] font-semibold leading-[1.03] tracking-tight"
          >
            {{ t('brand.tagline') }}
          </h1>
        </transition>
        <transition name="hero-rise" appear>
          <p style="--reveal-i: 2" class="mt-4 max-w-prose text-lg text-bnc-stone-600 dark:text-bnc-stone-300">
            Tahu kapan bus tiba sebelum kamu jalan ke halte. Posisi langsung
            dari sistem resmi Mitra Darat, diperbarui setiap detik.
          </p>
        </transition>
        <transition name="hero-rise" appear>
          <div style="--reveal-i: 3" class="mt-7 flex flex-wrap gap-3">
            <RouterLink
              :to="{ name: 'city', params: { city: cards[0].slug } }"
              class="inline-flex min-h-11 items-center gap-2 rounded-md bg-bnc-ink px-5 text-sm font-medium text-bnc-paper transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bnc-accent dark:bg-bnc-paper dark:text-bnc-ink"
            >
              Buka peta {{ cards[0].name }}
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </RouterLink>
            <a
              href="#fitur"
              class="inline-flex min-h-11 items-center rounded-md border border-bnc-stone-300 px-5 text-sm font-medium transition-colors hover:bg-bnc-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bnc-accent dark:border-bnc-stone-700 dark:hover:bg-bnc-stone-800"
            >
              Lihat fitur
            </a>
          </div>
        </transition>
      </div>
      <transition name="hero-rise" appear>
        <div style="--reveal-i: 3" class="mx-auto w-full max-w-md lg:max-w-none">
          <LandingRouteArt />
        </div>
      </transition>
    </section>

    <!-- 2. Pick a city -->
    <section class="border-t border-bnc-stone-200 py-10 dark:border-bnc-stone-800" aria-labelledby="kota">
      <h2 id="kota" class="font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500">Pilih kota</h2>
      <transition-group tag="div" name="hero-rise" appear class="mt-4 grid gap-4 sm:grid-cols-2">
        <RouterLink
          v-for="(c, i) in cards"
          :key="c.slug"
          :style="{ '--reveal-i': i + 4 }"
          :to="{ name: 'city', params: { city: c.slug } }"
          class="group relative flex items-center gap-4 overflow-hidden rounded-[var(--radius-lg)] border border-bnc-stone-200 bg-white p-5 shadow-[var(--shadow-subtle)] transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)] active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bnc-accent focus-visible:ring-offset-2 dark:border-bnc-stone-800 dark:bg-bnc-stone-900 dark:focus-visible:ring-offset-bnc-stone-900"
        >
          <span class="absolute inset-y-0 left-0 w-1" :style="{ background: c.accent }" aria-hidden="true" />
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
            <p v-if="c.city" class="text-xs text-bnc-stone-500">{{ c.city }}</p>
            <h3 class="font-display text-xl font-semibold tracking-tight">{{ c.name }}</h3>
            <p class="mt-0.5 font-mono text-xs tabular-nums text-bnc-stone-600 dark:text-bnc-stone-300">{{ c.blurb }}</p>
          </div>
          <svg class="h-4 w-4 shrink-0 text-bnc-stone-400 transition-transform duration-200 group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
        </RouterLink>
      </transition-group>
      <p
        v-if="error"
        class="mt-4 rounded-md border border-bnc-stone-200 bg-bnc-stone-50 p-3 font-mono text-[11px] text-bnc-stone-500 dark:border-bnc-stone-800 dark:bg-bnc-stone-900"
      >
        Gagal mengambil data realtime · menampilkan ringkasan statis
      </p>
    </section>

    <!-- 3. Features: one row per feature, clear dividers -->
    <section id="fitur" class="scroll-mt-20 border-t border-bnc-stone-200 py-10 dark:border-bnc-stone-800" aria-labelledby="fitur-h">
      <h2 id="fitur-h" class="font-display text-2xl font-semibold tracking-tight">Satu aplikasi, empat cara terbantu</h2>
      <ul class="mt-6 divide-y divide-bnc-stone-200 rounded-[var(--radius-lg)] border border-bnc-stone-200 bg-white dark:divide-bnc-stone-800 dark:border-bnc-stone-800 dark:bg-bnc-stone-900">
        <li v-for="(f, i) in features" :key="f.title" class="flex items-start gap-4 p-5 sm:p-6">
          <span class="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-bnc-accent/10 text-bnc-accent">
            <SidebarIcon :name="f.icon" />
          </span>
          <div class="min-w-0">
            <p class="font-mono text-[11px] tabular-nums text-bnc-stone-500">0{{ i + 1 }}</p>
            <h3 class="font-display text-lg font-semibold tracking-tight">{{ f.title }}</h3>
            <p class="mt-1 max-w-prose text-sm text-bnc-stone-600 dark:text-bnc-stone-300">{{ f.body }}</p>
          </div>
        </li>
      </ul>
    </section>

    <!-- 4. Footer -->
    <footer class="flex flex-col gap-3 border-t border-bnc-stone-200 py-6 text-xs text-bnc-stone-500 sm:flex-row sm:items-center sm:justify-between dark:border-bnc-stone-800">
      <div class="flex flex-col gap-1">
        <p>{{ t('footer.data') }}</p>
        <p class="select-text font-mono text-[11px] tabular-nums text-bnc-stone-600">
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
  </div>
</template>

<style scoped>
/* One authored entrance: headline, subhead, then the two city cards
 * rise in with a short stagger (--reveal-i set per element above).
 * cubic-bezier(0.16, 1, 0.3, 1) is a standard expo-out curve — quick
 * start, soft settle, no bounce — matching this app's otherwise
 * restrained motion elsewhere (BusDataBadge, panel slide-ups). */
.hero-rise-enter-active {
  transition: opacity 450ms cubic-bezier(0.16, 1, 0.3, 1), transform 450ms cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: calc(var(--reveal-i, 0) * 90ms);
}
.hero-rise-enter-from {
  opacity: 0;
  transform: translateY(16px);
}
@media (prefers-reduced-motion: reduce) {
  .hero-rise-enter-active {
    transition: none;
  }
}
</style>
