<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { trackEvent } from '@/lib/analytics'

const { t } = useI18n()
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    copied.value = true
    trackEvent('share_copy')
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Fallback: select-and-copy via a hidden textarea
    const ta = document.createElement('textarea')
    ta.value = window.location.href
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      copied.value = true
      setTimeout(() => (copied.value = false), 1500)
    } finally {
      document.body.removeChild(ta)
    }
  }
}
</script>

<template>
  <button
    type="button"
    class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-bnc-stone-500 transition-colors hover:bg-bnc-stone-100 hover:text-bnc-ink dark:hover:bg-bnc-stone-800 dark:hover:text-bnc-paper"
    :aria-live="copied ? 'polite' : 'off'"
    :aria-label="copied ? t('share.copied') : t('share.copy')"
    @click="copy"
  >
    <svg
      v-if="!copied"
      class="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
    <svg
      v-else
      class="h-3.5 w-3.5 text-bnc-good"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
    <span class="sr-only">{{ copied ? t('share.copied') : t('share.copy') }}</span>
  </button>
</template>
