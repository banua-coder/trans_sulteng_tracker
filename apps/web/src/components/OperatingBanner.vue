<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatWita, operatingState } from '@/lib/operating'

const { t } = useI18n()

const now = ref<Date>(new Date())
let timer: number | undefined

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date()
  }, 30_000)
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

const op = computed(() => operatingState(now.value))
const wita = computed(() => formatWita(op.value))

const statusLabel = computed(() =>
  op.value.active ? t('operating.active') : t('operating.sleeping'),
)

const dotStyle = computed(() => ({
  background: op.value.active ? 'var(--color-good)' : 'var(--color-stone-500, #78716C)',
}))
</script>

<template>
  <div
    class="flex items-center gap-3 border-b border-bnc-stone-200 bg-bnc-stone-50 px-4 py-2 text-xs dark:border-bnc-stone-800 dark:bg-bnc-stone-900"
  >
    <span class="h-2 w-2 rounded-full" :style="dotStyle" aria-hidden />
    <span class="font-mono text-[11px] uppercase tracking-wider text-bnc-stone-600 dark:text-bnc-stone-300">
      {{ wita }}
    </span>
    <span class="text-bnc-ink dark:text-bnc-paper">{{ statusLabel }}</span>
    <span class="hidden text-bnc-stone-500 sm:inline">·</span>
    <span class="hidden text-bnc-stone-500 sm:inline">{{ t('operating.window') }}</span>
  </div>
</template>
