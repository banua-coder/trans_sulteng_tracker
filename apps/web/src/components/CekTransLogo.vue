<script setup lang="ts">
/**
 * cektrans icon — rounded ink plate with a cyan route arc, an origin
 * halte dot, and a live bus dot. Same mark as the favicon / PWA icon
 * but inline so it composes with currentColor / theme tokens when
 * needed.
 */
withDefaults(
  defineProps<{
    size?: number
    title?: string
  }>(),
  { size: 26, title: 'cektrans' },
)
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    role="img"
    :aria-label="title"
    :width="size"
    :height="size"
    class="block shrink-0"
  >
    <title>{{ title }}</title>
    <rect width="512" height="512" rx="96" fill="#0A0E14" />
    <path
      d="M 110 392 C 200 380, 220 248, 312 224 S 392 148, 392 148"
      stroke="#1D9CD4"
      stroke-width="36"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle cx="110" cy="392" r="34" fill="#F7F7F4" stroke="#1D9CD4" stroke-width="14" />
    <circle cx="392" cy="148" r="48" fill="#1D9CD4" stroke="#F7F7F4" stroke-width="10" />
  </svg>
</template>
