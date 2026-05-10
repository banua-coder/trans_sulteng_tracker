<script setup lang="ts">
/**
 * Banua Coder icon mark — sourced from the official asset
 * (apps/web/public/banuacoder-icon.svg, copied verbatim from
 * banuacoder/src/assets/brand). Self-coloured (no currentColor)
 * so it reads identically across light + dark themes.
 */
withDefaults(
  defineProps<{
    size?: number
    title?: string
  }>(),
  { size: 24, title: 'Banua Coder' },
)
</script>

<template>
  <img
    src="/banuacoder-icon.svg"
    :alt="title"
    :width="size"
    :height="size"
    decoding="async"
    class="block shrink-0"
  />
</template>
