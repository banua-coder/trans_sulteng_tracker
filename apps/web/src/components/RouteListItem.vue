<script setup lang="ts">
/**
 * Single corridor row used in RoutesIndexView. Mirrors TJ's route
 * picker shape: a colored circle with the corridor code, the
 * origin → destination pair, and a chevron tail.
 */
defineProps<{
  kor: string
  color: string
  origin: string
  toward: string
  halteCount?: number
  /** Number of currently-active buses on this corridor (live socket). */
  busCount?: number
}>()
</script>

<template>
  <div
    class="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-bnc-stone-200 bg-white px-3 py-3 text-left transition-colors hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-900 dark:hover:border-bnc-stone-700"
  >
    <span
      class="grid h-10 w-10 shrink-0 place-items-center rounded-full font-mono text-xs font-extrabold text-white"
      :style="{ background: color }"
      aria-hidden
    >
      {{ kor }}
    </span>

    <div class="min-w-0 flex-1">
      <p class="truncate font-display text-sm font-semibold tracking-tight">
        {{ origin }} – {{ toward }}
      </p>
      <p
        v-if="halteCount != null || busCount != null"
        class="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500"
      >
        <span v-if="halteCount != null">{{ halteCount }} halte</span>
        <span
          v-if="busCount != null"
          class="inline-flex items-center gap-1"
          :class="busCount > 0 ? 'text-bnc-accent' : 'text-bnc-stone-500'"
        >
          <span
            class="h-1.5 w-1.5 rounded-full"
            :style="{
              background: busCount > 0 ? 'var(--color-bnc-accent)' : 'var(--color-stale)',
            }"
            aria-hidden
          />
          {{ busCount }} bus
        </span>
      </p>
    </div>

    <svg
      class="h-4 w-4 shrink-0 text-bnc-stone-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  </div>
</template>
