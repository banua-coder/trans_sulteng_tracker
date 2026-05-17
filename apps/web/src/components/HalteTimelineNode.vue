<script setup lang="ts">
defineProps<{
  haltename: string
  halteId?: string
  platform?: string | null
  accentColor: string
  isFirst?: boolean
  isLast?: boolean
  /** Other corridors that also stop here. The focused corridor renders
   *  at full opacity; others render dimmed so multi-corridor transfer
   *  points are obvious at a glance. */
  corridorBadges?: { kor: string; color: string; current: boolean }[]
}>()

const emit = defineEmits<{ halteClick: [id: string] }>()
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
      <button
        v-if="halteId"
        type="button"
        class="truncate text-left font-display text-sm font-semibold tracking-tight hover:underline"
        @click="emit('halteClick', halteId)"
      >
        {{ haltename }}
      </button>
      <p v-else class="truncate font-display text-sm font-semibold tracking-tight">
        {{ haltename }}
      </p>
      <p
        v-if="platform"
        class="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500"
      >
        {{ platform }}
      </p>

      <div
        v-if="corridorBadges && corridorBadges.length > 1"
        class="mt-1 flex flex-wrap gap-1"
      >
        <span
          v-for="b in corridorBadges"
          :key="b.kor"
          class="inline-flex items-center rounded px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-wider text-white transition-opacity"
          :style="{ background: b.color, opacity: b.current ? 1 : 0.45 }"
        >
          {{ b.kor }}
        </span>
      </div>

      <div class="mt-2 flex flex-col gap-2">
        <slot />
      </div>
    </div>
  </li>
</template>
