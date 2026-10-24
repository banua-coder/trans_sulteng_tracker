<script setup lang="ts">
/**
 * Hero artwork: a tiny stylised map with one route, its stops, A/B
 * terminals and a bus gliding along it. Same visual language as the
 * live map (white-cased line, ringed stops, rounded-square bus).
 */
const ROUTE = 'M 44 216 C 120 216 118 128 196 128 S 290 62 356 62'
</script>

<template>
  <svg viewBox="0 0 400 280" class="h-auto w-full" role="img" aria-label="Rute bus dengan bus yang bergerak">
    <rect width="400" height="280" rx="24" class="fill-bnc-stone-100 dark:fill-bnc-stone-800" />
    <!-- faint street grid -->
    <g class="stroke-white dark:stroke-bnc-stone-700" stroke-width="10" stroke-linecap="round" fill="none" opacity=".9">
      <path d="M-10 90H410M-10 190H410M90 -10V290M250 -10V290" />
    </g>
    <path d="M300 300C300 220 340 230 420 200" class="stroke-bnc-stone-300 dark:stroke-bnc-stone-600" stroke-width="22" stroke-linecap="round" fill="none" opacity=".55" />
    <!-- route: casing then colour -->
    <path :d="ROUTE" stroke="#fff" stroke-width="15" stroke-linecap="round" fill="none" />
    <path :d="ROUTE" stroke="#1D9CD4" stroke-width="9" stroke-linecap="round" fill="none" />
    <!-- stops -->
    <g fill="#fff" stroke="#1D9CD4" stroke-width="3">
      <circle cx="104" cy="212" r="6" />
      <circle cx="196" cy="128" r="6" />
      <circle cx="262" cy="92" r="6" />
    </g>
    <!-- terminals -->
    <g font-family="var(--font-mono)" font-weight="700" font-size="13" text-anchor="middle" fill="#fff">
      <circle cx="44" cy="216" r="13" fill="#1D9CD4" stroke="#fff" stroke-width="3" />
      <text x="44" y="221">A</text>
      <circle cx="356" cy="62" r="13" fill="#1D9CD4" stroke="#fff" stroke-width="3" />
      <text x="356" y="67">B</text>
    </g>
    <!-- bus -->
    <g class="art-bus" :style="{ offsetPath: `path('${ROUTE}')` }">
      <rect x="-15" y="-15" width="30" height="30" rx="9" fill="#1D9CD4" stroke="#fff" stroke-width="2.5" />
      <g transform="translate(-8 -8) scale(.667)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="3" width="16" height="14" rx="3" />
        <path d="M4 11h16M8 21v-3M16 21v-3" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.art-bus {
  offset-rotate: 0deg;
  animation: art-ride 9s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate;
}
@keyframes art-ride {
  from { offset-distance: 2%; }
  to { offset-distance: 98%; }
}
@media (prefers-reduced-motion: reduce) {
  .art-bus { animation: none; offset-distance: 45%; }
}
</style>
