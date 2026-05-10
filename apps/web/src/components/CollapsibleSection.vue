<script setup lang="ts">
/**
 * Sidebar accordion section. Click the header row to collapse /
 * expand the body. State lives in `useUiStore`, not a component-local
 * ref, so every render of the same panel name (desktop sidebar +
 * mobile bottom sheet) stays in sync and survives reloads.
 *
 * Animation: the grid-rows trick — animating between `1fr` and `0fr`
 * produces a smooth height collapse without measuring DOM by hand.
 */
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'

const props = withDefaults(
  defineProps<{
    name: string
    title: string
    count?: number | string
    defaultOpen?: boolean
  }>(),
  { defaultOpen: true },
)

const ui = useUiStore()

const open = computed<boolean>({
  get: () => ui.isPanelOpen(props.name, props.defaultOpen),
  set: (v) => ui.setPanelOpen(props.name, v),
})

function toggle() {
  open.value = !open.value
}
</script>

<template>
  <section class="flex flex-col">
    <button
      type="button"
      class="-mx-1 flex items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-bnc-stone-100 dark:hover:bg-bnc-stone-800/60"
      :aria-expanded="open"
      :aria-controls="`section-${name}`"
      @click="toggle"
    >
      <slot name="leading" />
      <h3 class="font-display text-sm font-semibold tracking-tight">
        {{ title }}
      </h3>
      <span
        v-if="count != null"
        class="font-mono text-[11px] text-bnc-stone-500"
      >
        {{ count }}
      </span>
      <slot name="meta" />
      <svg
        class="ml-auto h-4 w-4 text-bnc-stone-500 transition-transform duration-300"
        :class="open ? 'rotate-0' : '-rotate-90'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <div
      :id="`section-${name}`"
      class="grid transition-[grid-template-rows] duration-300 ease-out"
      :class="open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="pt-1.5">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  .transition-\[grid-template-rows\] {
    transition: none !important;
  }
}
</style>
