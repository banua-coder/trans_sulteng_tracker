<script setup lang="ts">
/**
 * Hand-drawn 24px stroke icons for the sidebar tabs. One family:
 * 1.8 stroke, round caps, so the four tabs read as a set.
 */
defineProps<{ name: 'routes' | 'buses' | 'stops' | 'plan' | 'companion' | 'download' }>()
</script>

<template>
  <svg
    class="h-[18px] w-[18px] shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- routes: a line that bends between two endpoints -->
    <template v-if="name === 'routes'">
      <circle cx="5.5" cy="18" r="2" />
      <circle cx="18.5" cy="6" r="2" />
      <path d="M7.5 18H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6.5" />
    </template>
    <!-- buses: front-facing bus -->
    <template v-else-if="name === 'buses'">
      <rect x="4" y="3.5" width="16" height="14" rx="3" />
      <path d="M4 11h16M8 21v-3.5M16 21v-3.5" />
      <circle cx="8.5" cy="14.2" r=".5" fill="currentColor" />
      <circle cx="15.5" cy="14.2" r=".5" fill="currentColor" />
    </template>
    <!-- stops: pin with a stop dot -->
    <template v-else-if="name === 'stops'">
      <path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </template>
    <!-- companion: compass needle inside a ring (guides you along) -->
    <template v-else-if="name === 'companion'">
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </template>
    <!-- download: tray with a down arrow -->
    <template v-else-if="name === 'download'">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </template>
    <!-- plan: origin to destination with a direction arrow -->
    <template v-else>
      <circle cx="5" cy="6" r="2" />
      <path d="M5 8v4a3 3 0 0 0 3 3h8.5" />
      <path d="m14 11.5 3.5 3.5-3.5 3.5" />
      <path d="M19 6h-6" />
    </template>
  </svg>
</template>
