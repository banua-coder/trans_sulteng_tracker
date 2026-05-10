<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()

const cards = [
  {
    slug: 'palu' as const,
    label: 'TransPalu',
    pref: '12',
    accent: '#1D9CD4',
    blurb: '9 koridor · 301 halte',
  },
  {
    slug: 'donggala' as const,
    label: 'Trans Donggala',
    pref: '11',
    accent: '#12398C',
    blurb: '3 koridor · 47 halte',
  },
]
</script>

<template>
  <section class="container mx-auto max-w-[var(--container-max)] px-6 py-16">
    <p class="font-mono text-[11px] uppercase tracking-[0.2em] text-bnc-stone-500">
      cektrans · realtime
    </p>
    <h1
      class="mt-3 max-w-3xl font-display text-[clamp(2rem,1.4rem+2.5vw,3.4rem)] font-semibold leading-[1.05] tracking-tight"
    >
      {{ t('brand.tagline') }}
    </h1>
    <p class="mt-4 max-w-prose text-bnc-stone-600 dark:text-bnc-stone-300">
      Pantau posisi bus, koridor, dan halte secara langsung — sumber data resmi
      Mitra Darat Kementerian Perhubungan.
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
        <div>
          <p class="font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500">
            pref {{ c.pref }}
          </p>
          <h2 class="mt-2 font-display text-2xl font-semibold tracking-tight">
            {{ c.label }}
          </h2>
          <p class="mt-1 text-sm text-bnc-stone-600 dark:text-bnc-stone-300">
            {{ c.blurb }}
          </p>
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

    <footer class="mt-20 border-t border-bnc-stone-200 pt-6 text-xs text-bnc-stone-500 dark:border-bnc-stone-800">
      <p>{{ t('footer.data') }}</p>
      <p class="mt-1">{{ t('footer.brand') }}</p>
    </footer>
  </section>
</template>
