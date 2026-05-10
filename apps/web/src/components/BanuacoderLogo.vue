<script setup lang="ts">
/**
 * Banua Coder horizontal logotype (logo + wordmark, no background
 * plate). Light + dark variants are the official brand assets copied
 * from banuacoder/src/assets/brand. Renders both <img>s and lets CSS
 * swap visibility based on the theme so the asset cache stays warm.
 */
withDefaults(
  defineProps<{
    /** Width in px. Height is derived from the asset's intrinsic ratio. */
    height?: number
    title?: string
  }>(),
  { height: 22, title: 'Banua Coder' },
)
</script>

<template>
  <span class="bnc-logotype shrink-0" :style="`--h:${height}px`" :aria-label="title" role="img">
    <img
      class="bnc-logotype__light"
      src="/banuacoder-horizontal.png"
      :alt="title"
      decoding="async"
    />
    <img
      class="bnc-logotype__dark"
      src="/banuacoder-horizontal-dark.png"
      :alt="title"
      decoding="async"
      aria-hidden="true"
    />
  </span>
</template>

<style scoped>
.bnc-logotype {
  display: inline-flex;
  align-items: center;
  height: var(--h);
  line-height: 0;
}
.bnc-logotype img {
  height: 100%;
  width: auto;
  display: block;
}
.bnc-logotype__dark { display: none; }
:where(.dark, .dark *) .bnc-logotype__light { display: none; }
:where(.dark, .dark *) .bnc-logotype__dark { display: block; }
</style>
