<script setup lang="ts">
defineProps<{
  backLabel: string
  mobileOnly?: boolean
}>()

const emit = defineEmits<{
  back: []
}>()
</script>

<template>
  <div
    class="sticky -top-1 z-20 -mx-4 flex flex-col gap-2 bg-bnc-paper px-4 pb-3 pt-2 shadow-[0_4px_8px_-6px_rgba(10,14,20,0.12)] dark:bg-bnc-stone-900"
    :class="mobileOnly ? 'lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:shadow-none dark:lg:bg-transparent' : ''"
  >
    <header class="flex items-center gap-2">
      <button
        type="button"
        class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
        :aria-label="backLabel"
        @click="emit('back')"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <slot />
    </header>
    <slot name="belowTitle" />
  </div>
</template>
