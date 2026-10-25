<script setup lang="ts">
/**
 * Direction switcher: two equal cards, each with the destination as
 * the headline ("Ke X") and the start as a quiet second line. The
 * selected card takes the route colour (tint, border, bottom bar), so
 * it reads as a choice and not as two stacked buttons. `layout` only
 * changes padding; the structure is the same on phones and desktop.
 */
import { useI18n } from 'vue-i18n'
import { prettyName } from '@/lib/format'

withDefaults(
  defineProps<{
    direction: 'a' | 'b'
    available: { a: boolean; b: boolean }
    towardLabel: string
    originLabel: string
    layout: 'mobile' | 'desktop'
    /** Route colour for the selected card. */
    color?: string
  }>(),
  { color: '#1D9CD4' },
)

const emit = defineEmits<{
  'update:direction': [value: 'a' | 'b']
}>()

const { t } = useI18n()
</script>

<template>
  <div :class="layout === 'desktop' ? 'border-b border-bnc-stone-200 px-4 py-3 dark:border-bnc-stone-800' : ''">
    <p class="mb-1.5 text-xs font-medium text-bnc-stone-500">{{ t('route.direction') }}</p>
    <div
      v-if="available.a || available.b"
      role="radiogroup"
      :aria-label="t('route.direction')"
      class="grid grid-cols-2 gap-1.5"
    >
      <button
        v-for="d in (['a', 'b'] as const)"
        v-show="available[d]"
        :key="d"
        type="button"
        role="radio"
        :aria-checked="direction === d"
        class="flex min-h-11 items-center justify-center rounded-lg border px-2 py-1.5 text-center text-xs font-semibold leading-snug transition-colors [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bnc-accent"
        :class="
          direction === d
            ? 'border-transparent text-bnc-ink dark:text-bnc-paper'
            : 'border-bnc-stone-200 bg-white text-bnc-stone-600 hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-900 dark:text-bnc-stone-300 dark:hover:border-bnc-stone-700'
        "
        :style="
          direction === d
            ? { background: `color-mix(in srgb, ${color} 12%, transparent)`, boxShadow: `inset 0 0 0 1.5px ${color}` }
            : undefined
        "
        @click="emit('update:direction', d)"
      >
        {{ t('route.directionTo', { place: prettyName(d === 'a' ? towardLabel : originLabel) || '—' }) }}
      </button>
    </div>
    <!-- One quiet line for the chosen direction's start, instead of a
         second line on every card. -->
    <p v-if="available.a || available.b" class="mt-1.5 text-[11px] leading-snug text-bnc-stone-500">
      {{ t('route.directionFrom', { place: prettyName(direction === 'a' ? originLabel : towardLabel) || '—' }) }}
    </p>
    <p
      v-if="!available.a || !available.b"
      class="mt-2 rounded-md bg-bnc-stone-100 px-2 py-1.5 text-[11px] text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300"
    >
      {{ t('route.oneWayOnly') }}
    </p>
  </div>
</template>
