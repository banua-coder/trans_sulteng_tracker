<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useCityStore } from '@/stores/city'
import { useBrtStore } from '@/stores/brt'
import BanuacoderLogo from '@/components/BanuacoderLogo.vue'
import CekTransLogo from '@/components/CekTransLogo.vue'
import DonateButton from '@/components/DonateButton.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import { CITY_PREF, type CitySlug } from '@/types/brt'

const { t } = useI18n()
const route = useRoute()
const city = useCityStore()
const brt = useBrtStore()

const paluMeta = computed(() => brt.cityByPref.get(CITY_PREF.palu) ?? null)
const donggalaMeta = computed(() => brt.cityByPref.get(CITY_PREF.donggala) ?? null)

// Switcher only matters when the user is actually on a city map.
const showCitySwitcher = computed(() => route.name === 'city')

const settingsOpen = ref(false)

function pickCity(slug: CitySlug) {
  city.setCity(slug)
}

/** Two-letter monogram for the icon-less fallback state. City names
 *  are proper nouns (same in every locale) but can be a single
 *  camelCase-ish word ("TransPalu") or space-separated ("Trans
 *  Donggala") — matching capitalized word-starts handles both. Used
 *  when city icon metadata is missing/slow to load: the full name
 *  used to render unclamped inside the 36px circular button and
 *  spill out of it. */
function initials(name: string): string {
  const words = name.match(/[A-Z][a-z]*/g) ?? [name]
  return words.map((w) => w[0]).join('').slice(0, 2).toUpperCase()
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
        data-tour="city-switcher"
      >
        <button
          type="button"
          class="grid h-9 w-9 shrink-0 place-items-center rounded-full p-1 transition-colors"
          :class="
            city.slug === 'palu'
              ? 'bg-bnc-ink dark:bg-bnc-paper'
              : 'hover:bg-bnc-stone-100 dark:hover:bg-bnc-stone-800'
          "
          :aria-label="t('nav.palu')"
          :aria-pressed="city.slug === 'palu'"
          :title="paluMeta?.name ?? t('nav.palu')"
          @click="pickCity('palu')"
        >
          <img
            v-if="paluMeta?.icon"
            :src="paluMeta.icon"
            :alt="paluMeta.name + ' logo'"
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
            class="h-full w-full rounded-full object-contain"
            @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
          />
          <span v-else class="font-mono text-[11px] font-bold uppercase tracking-wider">
            {{ initials(paluMeta?.name ?? t('nav.palu')) }}
          </span>
        </button>
        <button
          type="button"
          class="grid h-9 w-9 shrink-0 place-items-center rounded-full p-1 transition-colors"
          :class="
            city.slug === 'donggala'
              ? 'bg-bnc-ink dark:bg-bnc-paper'
              : 'hover:bg-bnc-stone-100 dark:hover:bg-bnc-stone-800'
          "
          :aria-label="t('nav.donggala')"
          :aria-pressed="city.slug === 'donggala'"
          :title="donggalaMeta?.name ?? t('nav.donggala')"
          @click="pickCity('donggala')"
        >
          <img
            v-if="donggalaMeta?.icon"
            :src="donggalaMeta.icon"
            :alt="donggalaMeta.name + ' logo'"
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
            class="h-full w-full rounded-full object-contain"
            @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
          />
          <span v-else class="font-mono text-[11px] font-bold uppercase tracking-wider">
            {{ initials(donggalaMeta?.name ?? t('nav.donggala')) }}
          </span>
        </button>
      </nav>
    </transition>

    <div class="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
      <DonateButton />

      <router-link
        v-if="showCitySwitcher"
        :to="{ name: 'map-export', params: { city: city.slug } }"
        class="grid h-8 w-8 place-items-center rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
        :aria-label="t('a11y.downloadMap')"
        :title="t('a11y.downloadMap')"
        data-tour="export-map"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
      </router-link>

      <button
        type="button"
        class="grid h-8 w-8 place-items-center rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
        :aria-label="t('a11y.settings')"
        :title="t('a11y.settings')"
        data-tour="settings-button"
        @click="settingsOpen = true"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
    <SettingsModal :open="settingsOpen" @close="settingsOpen = false" />
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

</style>
