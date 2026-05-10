<script setup lang="ts">
/**
 * One halte node in the route detail timeline (vertical list).
 * Renders the dot + connector + halte name, and slots the incoming
 * buses (IncomingBusCard) underneath. Parent supplies positioning
 * context (first/last in list) so the connector line draws on the
 * correct side.
 */
defineProps<{
  haltename: string
  /** "Platform A-B-C" style descriptor when the upstream feed has
   *  one; we don't currently get this from Trans Palu so it stays
   *  optional. */
  platform?: string | null
  accentColor: string
  isFirst?: boolean
  isLast?: boolean
}>()
</script>

<template>
  <li class="relative flex items-start gap-3 pt-1">
    <!-- Vertical track — pinned to the horizontal center of the dot.
         Dot is 14 px wide starting at x=0, so its center is at x=7.
         Track (w-px) sits at left-[7px] for pixel-perfect alignment. -->
    <span
      v-if="!isFirst || !isLast"
      class="absolute left-[7px] w-px"
      :class="{
        'top-3 bottom-0': isFirst && !isLast,
        'top-0 bottom-3': isLast && !isFirst,
        'top-0 bottom-0': !isFirst && !isLast,
      }"
      :style="{ background: accentColor, opacity: 0.5 }"
      aria-hidden
    />
    <!-- node dot -->
    <span
      class="relative z-[1] mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white"
      :style="{ background: accentColor, boxShadow: '0 0 0 1px ' + accentColor }"
      aria-hidden
    />

    <div class="min-w-0 flex-1 pb-3">
      <p class="truncate font-display text-sm font-semibold tracking-tight">
        {{ haltename }}
      </p>
      <p
        v-if="platform"
        class="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500"
      >
        {{ platform }}
      </p>

      <div class="mt-2 flex flex-col gap-2">
        <slot />
      </div>
    </div>
  </li>
</template>
