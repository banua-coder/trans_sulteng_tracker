<script setup lang="ts">
defineProps<{
  direction: 'a' | 'b'
  available: { a: boolean; b: boolean }
  towardLabel: string
  originLabel: string
  layout: 'mobile' | 'desktop'
}>()

const emit = defineEmits<{
  'update:direction': [value: 'a' | 'b']
}>()
</script>

<template>
  <!-- Mobile: tab underline style -->
  <template v-if="layout === 'mobile'">
    <div
      v-if="available.a || available.b"
      class="flex border-b border-bnc-stone-200 dark:border-bnc-stone-800"
    >
      <button
        v-if="available.a"
        type="button"
        class="flex-1 truncate px-2 pb-1.5 pt-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
        :class="
          direction === 'a'
            ? 'border-b-2 border-bnc-primary text-bnc-primary dark:border-bnc-accent dark:text-bnc-accent'
            : 'text-bnc-stone-500 hover:text-bnc-stone-700 dark:hover:text-bnc-stone-200'
        "
        @click="emit('update:direction', 'a')"
      >
        {{ towardLabel }}
      </button>
      <button
        v-if="available.b"
        type="button"
        class="flex-1 truncate px-2 pb-1.5 pt-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
        :class="
          direction === 'b'
            ? 'border-b-2 border-bnc-primary text-bnc-primary dark:border-bnc-accent dark:text-bnc-accent'
            : 'text-bnc-stone-500 hover:text-bnc-stone-700 dark:hover:text-bnc-stone-200'
        "
        @click="emit('update:direction', 'b')"
      >
        {{ originLabel }}
      </button>
    </div>
    <p
      v-if="!available.a || !available.b"
      class="rounded-md bg-bnc-stone-100 px-2 py-1.5 text-[10px] text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300"
    >
      {{ $t('route.oneWayOnly') }}
    </p>
  </template>

  <!-- Desktop: block button style -->
  <template v-else>
    <div class="border-b border-bnc-stone-200 px-4 py-3 dark:border-bnc-stone-800">
      <p class="font-mono text-[11px] uppercase tracking-wider text-bnc-stone-500">
        Arah
      </p>
      <div class="mt-2 grid gap-1.5">
        <button
          v-if="available.a"
          type="button"
          class="flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors"
          :class="
            direction === 'a'
              ? 'border-bnc-ink bg-bnc-ink text-bnc-paper dark:border-bnc-paper dark:bg-bnc-paper dark:text-bnc-ink'
              : 'border-bnc-stone-200 bg-bnc-stone-50 text-bnc-stone-700 hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-800/50 dark:text-bnc-stone-200'
          "
          @click="emit('update:direction', 'a')"
        >
          <span class="shrink-0 font-mono text-[11px] uppercase tracking-wider opacity-70">→</span>
          <span class="font-display font-semibold">{{ towardLabel || '—' }}</span>
        </button>
        <button
          v-if="available.b"
          type="button"
          class="flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors"
          :class="
            direction === 'b'
              ? 'border-bnc-ink bg-bnc-ink text-bnc-paper dark:border-bnc-paper dark:bg-bnc-paper dark:text-bnc-ink'
              : 'border-bnc-stone-200 bg-bnc-stone-50 text-bnc-stone-700 hover:border-bnc-stone-300 dark:border-bnc-stone-800 dark:bg-bnc-stone-800/50 dark:text-bnc-stone-200'
          "
          @click="emit('update:direction', 'b')"
        >
          <span class="shrink-0 font-mono text-[11px] uppercase tracking-wider opacity-70">→</span>
          <span class="font-display font-semibold">{{ originLabel || '—' }}</span>
        </button>
        <p
          v-if="!available.a || !available.b"
          class="rounded-md bg-bnc-stone-100 px-2 py-1.5 text-[11px] text-bnc-stone-600 dark:bg-bnc-stone-800 dark:text-bnc-stone-300"
        >
          Operator hanya menyediakan halte satu arah untuk koridor ini.
        </p>
      </div>
    </div>
  </template>
</template>
