<script setup lang="ts">
/**
 * Central settings — theme + language + audio. Opened from the gear
 * icon in TopBar. Replaces the old standalone language + theme
 * toggle buttons.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useRideStore } from '@/stores/ride'
import { useTheme, type ThemeMode } from '@/lib/theme'
import { useAnnouncer } from '@/composables/useAnnouncer'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t, locale } = useI18n()
const ui = useUiStore()
const ride = useRideStore()
const { audioEnabled, audioVolume, vibrationEnabled } = storeToRefs(ui)
const { enabled: rideEnabled } = storeToRefs(ride)
const { mode, setMode } = useTheme()
const announcer = useAnnouncer()

// iOS Safari has no Vibration API. Hide the toggle instead of
// showing a broken switch.
const showVibration = computed(() => 'vibrate' in navigator)

const themeOptions: { value: ThemeMode; labelKey: string }[] = [
  { value: 'light', labelKey: 'settings.themeLight' },
  { value: 'dark', labelKey: 'settings.themeDark' },
  { value: 'system', labelKey: 'settings.themeSystem' },
]

function setLocale(next: 'id' | 'en') {
  locale.value = next
  localStorage.setItem('cektrans:locale', next)
}

async function test() {
  // First user gesture in the audio path — unlocks autoplay so
  // later announcements (e.g. from companion mode) work without
  // user interaction.
  if (!audioEnabled.value) ui.setAudioEnabled(true)
  await announcer.announce({
    text: { id: t('settings.testSpeech', 'id'), en: t('settings.testSpeech', 'en') },
    chime: 'arrival',
  })
}
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[1200] flex items-center justify-center bg-bnc-ink/40 px-4 py-6 backdrop-blur-sm"
        role="dialog"
        :aria-label="t('settings.title')"
        @click.self="emit('close')"
      >
        <section
          class="flex max-h-[calc(100dvh-48px)] w-full max-w-sm flex-col overflow-hidden rounded-[var(--radius-md)] border border-bnc-stone-200 bg-white shadow-[var(--shadow-elevated)] dark:border-bnc-stone-800 dark:bg-bnc-stone-900"
        >
        <header class="flex items-center justify-between border-b border-bnc-stone-200 px-4 py-3 dark:border-bnc-stone-800">
          <h2 class="font-display text-sm font-semibold">{{ t('settings.title') }}</h2>
          <button
            type="button"
            class="grid h-7 w-7 place-items-center rounded-full text-bnc-stone-500 transition-colors hover:bg-bnc-stone-100 dark:hover:bg-bnc-stone-800"
            :aria-label="t('settings.close')"
            @click="emit('close')"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </header>

        <div class="flex flex-col gap-5 overflow-y-auto p-4">
          <section>
            <h3 class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
              {{ t('settings.sectionAppearance') }}
            </h3>
            <div class="mt-2 flex flex-col gap-3">
              <div>
                <p class="text-xs font-semibold text-bnc-stone-600 dark:text-bnc-stone-300">{{ t('settings.theme') }}</p>
                <div class="mt-1 inline-flex overflow-hidden rounded-md border border-bnc-stone-300 dark:border-bnc-stone-700">
                  <button
                    v-for="opt in themeOptions"
                    :key="opt.value"
                    type="button"
                    class="px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
                    :class="
                      mode === opt.value
                        ? 'bg-bnc-ink text-bnc-paper dark:bg-bnc-paper dark:text-bnc-ink'
                        : 'bg-white text-bnc-stone-600 hover:bg-bnc-stone-100 dark:bg-bnc-stone-900 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800'
                    "
                    @click="setMode(opt.value)"
                  >
                    {{ t(opt.labelKey) }}
                  </button>
                </div>
              </div>

              <div>
                <p class="text-xs font-semibold text-bnc-stone-600 dark:text-bnc-stone-300">{{ t('settings.language') }}</p>
                <div class="mt-1 inline-flex overflow-hidden rounded-md border border-bnc-stone-300 dark:border-bnc-stone-700">
                  <button
                    type="button"
                    class="px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
                    :class="
                      locale === 'id'
                        ? 'bg-bnc-ink text-bnc-paper dark:bg-bnc-paper dark:text-bnc-ink'
                        : 'bg-white text-bnc-stone-600 hover:bg-bnc-stone-100 dark:bg-bnc-stone-900 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800'
                    "
                    @click="setLocale('id')"
                  >ID</button>
                  <button
                    type="button"
                    class="px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
                    :class="
                      locale === 'en'
                        ? 'bg-bnc-ink text-bnc-paper dark:bg-bnc-paper dark:text-bnc-ink'
                        : 'bg-white text-bnc-stone-600 hover:bg-bnc-stone-100 dark:bg-bnc-stone-900 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800'
                    "
                    @click="setLocale('en')"
                  >EN</button>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
              {{ t('settings.sectionAudio') }}
            </h3>
            <div class="mt-2 flex flex-col gap-3">
              <label class="flex items-start justify-between gap-3">
                <span class="flex-1">
                  <span class="block text-xs font-semibold text-bnc-stone-600 dark:text-bnc-stone-300">
                    {{ t('settings.audioEnable') }}
                  </span>
                  <span class="block text-[10px] text-bnc-stone-500">{{ t('settings.audioEnableHint') }}</span>
                </span>
                <input
                  type="checkbox"
                  class="mt-1 h-4 w-4 shrink-0 accent-bnc-primary"
                  :checked="audioEnabled"
                  @change="ui.setAudioEnabled(($event.target as HTMLInputElement).checked)"
                />
              </label>

              <label class="flex items-center gap-3" :class="{ 'opacity-50': !audioEnabled }">
                <span class="w-16 text-xs font-semibold text-bnc-stone-600 dark:text-bnc-stone-300">
                  {{ t('settings.volume') }}
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  class="flex-1 accent-bnc-primary"
                  :value="audioVolume"
                  :disabled="!audioEnabled"
                  @input="ui.setAudioVolume(Number(($event.target as HTMLInputElement).value))"
                />
                <span class="w-10 text-right font-mono text-[10px] tabular-nums text-bnc-stone-500">
                  {{ audioVolume }}%
                </span>
              </label>

              <label v-if="showVibration" class="flex items-start justify-between gap-3">
                <span class="flex-1">
                  <span class="block text-xs font-semibold text-bnc-stone-600 dark:text-bnc-stone-300">
                    {{ t('settings.vibration') }}
                  </span>
                  <span class="block text-[10px] text-bnc-stone-500">{{ t('settings.vibrationHint') }}</span>
                </span>
                <input
                  type="checkbox"
                  class="mt-1 h-4 w-4 shrink-0 accent-bnc-primary"
                  :checked="vibrationEnabled"
                  @change="ui.setVibrationEnabled(($event.target as HTMLInputElement).checked)"
                />
              </label>

              <button
                type="button"
                class="inline-flex items-center justify-center gap-2 self-start rounded-md border border-bnc-stone-300 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-bnc-stone-700 transition-colors hover:bg-bnc-stone-100 dark:border-bnc-stone-700 dark:text-bnc-stone-200 dark:hover:bg-bnc-stone-800"
                @click="test"
              >
                <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
                {{ t('settings.test') }}
              </button>

              <!-- Trip-companion beta toggle. Flag-gated rollout per
                   the phased plan; Phase 5 removes this row. -->
              <label class="flex cursor-pointer items-start gap-2 pt-2 text-xs">
                <input
                  type="checkbox"
                  class="mt-1 h-4 w-4 shrink-0 accent-bnc-primary"
                  :checked="rideEnabled"
                  @change="ride.setEnabled(($event.target as HTMLInputElement).checked)"
                />
                <span>{{ t('ride.enableFlag') }}</span>
              </label>
            </div>
          </section>
        </div>
      </section>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 180ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
