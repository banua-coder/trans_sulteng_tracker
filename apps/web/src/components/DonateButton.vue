<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const open = ref(false)

function close() {
  open.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(open, (v) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = v ? 'hidden' : ''
  if (v) document.addEventListener('keydown', onKey)
  else document.removeEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
    document.removeEventListener('keydown', onKey)
  }
})
</script>

<template>
  <button
    type="button"
    class="grid h-8 w-8 place-items-center rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 hover:text-rose-500 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800 dark:hover:text-rose-400"
    :aria-label="t('a11y.donate')"
    :title="t('a11y.donate')"
    @click="open = true"
  >
    <svg
      class="h-4 w-4"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 21s-7.5-4.6-9.5-9.3C1.2 8 3.4 4.5 7 4.5c2 0 3.6 1 5 2.7 1.4-1.7 3-2.7 5-2.7 3.6 0 5.8 3.5 4.5 7.2C19.5 16.4 12 21 12 21z" />
    </svg>
  </button>

  <Teleport to="body">
    <transition name="donate-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[1400] flex items-center justify-center bg-bnc-ink/60 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        :aria-label="t('donate.title')"
        @click.self="close"
      >
        <div
          class="relative flex w-full max-w-xs flex-col items-center gap-3 rounded-[var(--radius-lg)] bg-bnc-paper p-5 shadow-[var(--shadow-elevated)] dark:bg-bnc-stone-900"
        >
          <button
            type="button"
            class="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-bnc-stone-500 transition-colors hover:bg-bnc-stone-100 hover:text-bnc-ink dark:hover:bg-bnc-stone-800 dark:hover:text-bnc-paper"
            :aria-label="t('donate.close')"
            @click="close"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <h2 class="font-display text-base font-bold tracking-tight">
            {{ t('donate.title') }}
          </h2>
          <p class="text-center text-xs text-bnc-stone-600 dark:text-bnc-stone-300">
            {{ t('donate.subtitle') }}
          </p>

          <img
            src="/saweria-qr.webp"
            :alt="t('donate.title')"
            width="240"
            height="240"
            class="rounded-[var(--radius-md)] bg-white p-2"
            decoding="async"
          />

          <p class="text-center font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
            {{ t('donate.scanHint') }}
          </p>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.donate-fade-enter-active,
.donate-fade-leave-active {
  transition: opacity 180ms ease;
}
.donate-fade-enter-from,
.donate-fade-leave-to {
  opacity: 0;
}
</style>
