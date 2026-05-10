<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSocketStore } from '@/stores/socket'
import { useCityStore } from '@/stores/city'
import BanuacoderLogo from '@/components/BanuacoderLogo.vue'
import type { CitySlug } from '@/types/brt'

const { t, locale } = useI18n()
const socket = useSocketStore()
const city = useCityStore()

const statusKey = computed(() => {
  switch (socket.state) {
    case 'live':
      return 'status.live'
    case 'connecting':
      return 'status.connecting'
    case 'offline':
      return 'status.offline'
    default:
      return 'status.connecting'
  }
})

function toggleTheme() {
  const root = document.documentElement
  root.classList.toggle('dark')
  localStorage.setItem('cektrans:theme', root.classList.contains('dark') ? 'dark' : 'light')
}

function toggleLang() {
  const next = locale.value === 'id' ? 'en' : 'id'
  locale.value = next
  localStorage.setItem('cektrans:locale', next)
}

function pickCity(slug: CitySlug) {
  city.setCity(slug)
}
</script>

<template>
  <header
    class="sticky top-0 z-[1100] flex h-[var(--header-h)] items-center gap-4 border-b border-bnc-stone-200 bg-bnc-paper/85 px-4 backdrop-blur dark:border-bnc-stone-800 dark:bg-bnc-ink/85"
  >
    <a
      href="https://banuacoder.com"
      target="_blank"
      rel="noopener"
      class="flex items-center gap-2 rounded-md px-1.5 py-1 text-bnc-ink transition-colors hover:bg-bnc-stone-100 dark:text-bnc-paper dark:hover:bg-bnc-stone-800"
      aria-label="Banua Coder · banuacoder.com"
    >
      <BanuacoderLogo :size="22" />
      <span class="hidden font-display text-sm font-semibold tracking-tight sm:inline">
        Banuacoder
      </span>
    </a>

    <span
      aria-hidden
      class="hidden h-5 w-px bg-bnc-stone-200 sm:block dark:bg-bnc-stone-800"
    />

    <router-link
      to="/"
      class="flex items-center gap-1 font-display text-base font-semibold tracking-tight"
    >
      <span class="text-bnc-stone-500">/</span>
      <span>{{ t('brand.name') }}</span>
    </router-link>

    <nav class="ml-2 hidden items-center gap-1 sm:flex" :aria-label="t('nav.home')">
      <button
        type="button"
        class="rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors"
        :class="
          city.slug === 'palu'
            ? 'bg-bnc-ink text-bnc-paper dark:bg-bnc-paper dark:text-bnc-ink'
            : 'text-bnc-stone-600 hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800'
        "
        @click="pickCity('palu')"
      >
        {{ t('nav.palu') }}
      </button>
      <button
        type="button"
        class="rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors"
        :class="
          city.slug === 'donggala'
            ? 'bg-bnc-ink text-bnc-paper dark:bg-bnc-paper dark:text-bnc-ink'
            : 'text-bnc-stone-600 hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800'
        "
        @click="pickCity('donggala')"
      >
        {{ t('nav.donggala') }}
      </button>
    </nav>

    <div class="ml-auto flex items-center gap-3">
      <span
        class="flex items-center gap-2 rounded-full bg-bnc-stone-100 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300"
      >
        <span
          class="live-dot"
          :style="
            socket.state === 'live'
              ? undefined
              : { background: 'var(--color-stale)', animation: 'none' }
          "
        />
        {{ t(statusKey) }}
        <template v-if="socket.viewers > 0">
          · <span class="font-mono">{{ socket.viewers }}</span>
        </template>
      </span>

      <button
        type="button"
        class="rounded-full p-2 text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
        :aria-label="t('a11y.toggleLang')"
        @click="toggleLang"
      >
        <span class="font-mono text-[11px] uppercase">{{ locale }}</span>
      </button>
      <button
        type="button"
        class="rounded-full p-2 text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
        :aria-label="t('a11y.toggleTheme')"
        @click="toggleTheme"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"
          />
        </svg>
      </button>
    </div>
  </header>
</template>
