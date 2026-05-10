<script setup lang="ts">
/**
 * Banua Coder horizontal logotype (logo + wordmark, no background
 * plate). Light + dark variants are the official brand assets copied
 * from banuacoder/src/assets/brand. Dark mode swap uses Tailwind's
 * `dark:` variant (wired in global.css via @custom-variant) so we
 * dodge the Vue-scoped-CSS compound-selector pitfall entirely.
 */
withDefaults(
  defineProps<{
    /** Height in px. Width is derived from the asset's intrinsic ratio. */
    height?: number
    title?: string
  }>(),
  { height: 22, title: 'Banua Coder' },
)
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center"
    :style="`height:${height}px;line-height:0`"
    :aria-label="title"
    role="img"
  >
    <img
      src="/banuacoder-horizontal.png"
      :alt="title"
      decoding="async"
      class="block h-full w-auto dark:hidden"
    />
    <img
      src="/banuacoder-horizontal-dark.png"
      alt=""
      aria-hidden="true"
      decoding="async"
      class="hidden h-full w-auto dark:block"
    />
  </span>
</template>
