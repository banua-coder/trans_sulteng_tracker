<script setup lang="ts">
/**
 * Tap-target + dialog explaining the ETA color signal. Mirrors the
 * "Bus Arrival Time Guide" tile from TJ Transjakarta. Drops into any
 * heading that shows an ETA — the button is icon-only so it disappears
 * into the layout until the user looks for it.
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const open = ref(false)

function show() {
  open.value = true
}
function close() {
  open.value = false
}
</script>

<template>
  <button
    type="button"
    class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-bnc-stone-400 transition-colors hover:bg-bnc-stone-100 hover:text-bnc-accent dark:hover:bg-bnc-stone-800"
    :aria-label="t('etaGuide.open')"
    :title="t('etaGuide.open')"
    @click.stop="show"
  >
    <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  </button>

  <transition name="guide-fade">
    <div
      v-if="open"
      class="fixed inset-0 z-[1200] flex items-end justify-center bg-bnc-ink/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      @click.self="close"
    >
      <div
        class="w-full max-w-sm rounded-[var(--radius-md)] bg-bnc-paper p-4 shadow-[var(--shadow-elevated)] dark:bg-bnc-stone-900"
      >
        <header class="flex items-start justify-between gap-3">
          <h3 class="font-display text-base font-bold tracking-tight">
            {{ t('etaGuide.title') }}
          </h3>
          <button
            type="button"
            class="rounded-full p-1 text-bnc-stone-500 transition-colors hover:bg-bnc-stone-100 hover:text-bnc-ink dark:hover:bg-bnc-stone-800 dark:hover:text-bnc-paper"
            :aria-label="t('etaGuide.close')"
            @click="close"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </header>
        <p class="mt-2 text-xs text-bnc-stone-600 dark:text-bnc-stone-300">
          {{ t('etaGuide.intro') }}
        </p>

        <dl class="mt-3 flex flex-col gap-3">
          <div class="flex items-start gap-3">
            <span class="mt-0.5 h-3 w-3 shrink-0 rounded-full" style="background: var(--color-good)" aria-hidden />
            <div class="min-w-0">
              <dt class="font-mono text-[11px] font-bold uppercase tracking-wider" style="color: var(--color-good)">
                {{ t('etaGuide.goodLabel') }}
              </dt>
              <dd class="mt-0.5 text-xs text-bnc-stone-600 dark:text-bnc-stone-300">
                {{ t('etaGuide.goodDesc') }}
              </dd>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <span class="mt-0.5 h-3 w-3 shrink-0 rounded-full" style="background: var(--color-warn)" aria-hidden />
            <div class="min-w-0">
              <dt class="font-mono text-[11px] font-bold uppercase tracking-wider" style="color: var(--color-warn)">
                {{ t('etaGuide.warnLabel') }}
              </dt>
              <dd class="mt-0.5 text-xs text-bnc-stone-600 dark:text-bnc-stone-300">
                {{ t('etaGuide.warnDesc') }}
              </dd>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <span class="mt-0.5 h-3 w-3 shrink-0 rounded-full" style="background: var(--color-stale)" aria-hidden />
            <div class="min-w-0">
              <dt class="font-mono text-[11px] font-bold uppercase tracking-wider" style="color: var(--color-stale)">
                {{ t('etaGuide.staleLabel') }}
              </dt>
              <dd class="mt-0.5 text-xs text-bnc-stone-600 dark:text-bnc-stone-300">
                {{ t('etaGuide.staleDesc') }}
              </dd>
            </div>
          </div>
        </dl>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.guide-fade-enter-active,
.guide-fade-leave-active {
  transition: opacity 180ms ease;
}
.guide-fade-enter-from,
.guide-fade-leave-to {
  opacity: 0;
}
</style>
