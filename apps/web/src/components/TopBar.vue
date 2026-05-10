<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useSocketStore } from '@/stores/socket'
import { useCityStore } from '@/stores/city'
import { useTheme } from '@/lib/theme'
import BanuacoderLogo from '@/components/BanuacoderLogo.vue'
import CekTransLogo from '@/components/CekTransLogo.vue'
import type { CitySlug } from '@/types/brt'

const { t, locale } = useI18n()
const route = useRoute()
const socket = useSocketStore()
const city = useCityStore()

// Switcher only matters when the user is actually on a city map.
const showCitySwitcher = computed(() => route.name === 'city')

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

const { isDark, toggleTheme } = useTheme()

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
    class="sticky top-0 z-[1100] flex h-[var(--header-h)] items-center gap-2 border-b border-bnc-stone-200 bg-bnc-paper/85 px-3 backdrop-blur sm:gap-4 sm:px-4 dark:border-bnc-stone-800 dark:bg-bnc-ink/85"
  >
    <a
      href="https://banuacoder.com"
      target="_blank"
      rel="noopener"
      class="hidden shrink-0 items-center gap-2 rounded-md px-1.5 py-1 text-bnc-ink transition-colors hover:bg-bnc-stone-100 sm:flex dark:text-bnc-paper dark:hover:bg-bnc-stone-800"
      aria-label="Banua Coder · banuacoder.com"
    >
      <BanuacoderLogo :height="20" />
    </a>

    <span
      aria-hidden
      class="hidden h-5 w-px shrink-0 bg-bnc-stone-200 sm:block dark:bg-bnc-stone-800"
    />

    <router-link
      to="/"
      class="flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 font-display text-sm font-semibold tracking-tight transition-colors hover:bg-bnc-stone-100 sm:text-base dark:hover:bg-bnc-stone-800"
      :aria-label="t('brand.name')"
      :title="t('brand.name')"
    >
      <span class="hidden text-bnc-stone-500 sm:inline">/</span>
      <CekTransLogo :size="28" class="sm:hidden" />
      <span class="hidden sm:inline">{{ t('brand.name') }}</span>
    </router-link>

    <transition name="switcher-fade">
      <nav
        v-if="showCitySwitcher"
        class="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&amp;::-webkit-scrollbar]:hidden"
        :aria-label="t('nav.home')"
      >
        <button
          type="button"
          class="shrink-0 rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors"
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
          class="shrink-0 rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors"
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
    </transition>

    <div class="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
      <span
        class="flex items-center gap-2 rounded-full bg-bnc-stone-100 px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-bnc-stone-600 sm:px-3 dark:bg-bnc-stone-800 dark:text-bnc-stone-300"
        :title="t(statusKey)"
      >
        <span
          class="live-dot"
          :style="
            socket.state === 'live'
              ? undefined
              : { background: 'var(--color-stale)', animation: 'none' }
          "
        />
        <span class="hidden sm:inline">{{ t(statusKey) }}</span>
        <template v-if="socket.viewers > 0">
          <span class="hidden sm:inline">·</span>
          <span class="font-mono">{{ socket.viewers }}</span>
        </template>
      </span>

      <button
        type="button"
        class="grid h-8 w-8 place-items-center rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
        :aria-label="t('a11y.toggleLang')"
        @click="toggleLang"
      >
        <span class="font-mono text-[11px] uppercase">{{ locale }}</span>
      </button>
      <button
        type="button"
        class="relative grid h-8 w-8 place-items-center overflow-hidden rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
        :aria-label="t('a11y.toggleTheme')"
        :aria-pressed="isDark"
        @click="toggleTheme()"
      >
        <transition name="theme-icon" mode="out-in">
          <svg
            v-if="isDark"
            key="sun"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
          <svg
            v-else
            key="moon"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
          </svg>
        </transition>
      </button>
    </div>
  </header>
</template>

<style scoped>
.switcher-fade-enter-active,
.switcher-fade-leave-active {
  transition: opacity 200ms ease, transform 220ms ease;
}
.switcher-fade-enter-from,
.switcher-fade-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}

.theme-icon-enter-active,
.theme-icon-leave-active {
  transition: opacity 200ms ease, transform 250ms ease;
}
.theme-icon-enter-from {
  opacity: 0;
  transform: rotate(-60deg) scale(0.7);
}
.theme-icon-leave-to {
  opacity: 0;
  transform: rotate(60deg) scale(0.7);
}
@media (prefers-reduced-motion: reduce) {
  .theme-icon-enter-active,
  .theme-icon-leave-active {
    transition: none;
  }
}
</style>
