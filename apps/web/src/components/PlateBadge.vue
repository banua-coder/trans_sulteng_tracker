<script setup lang="ts">
/**
 * Indonesian commercial vehicle plate badge — yellow plate with black
 * bold text + black border. Trans Palu / Trans Donggala buses use
 * yellow plates ("DN ... AU"), per Indonesian plat number convention.
 *
 * Sizing comes from the parent's text-size class via `size` prop so we
 * can reuse the same badge in dense list rows and big detail cards.
 */
type Size = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    plate: string | null | undefined
    /** Visual size. 'sm' for list rows, 'md' for cards, 'lg' for hero. */
    size?: Size
  }>(),
  { size: 'md' },
)

const sizeClasses: Record<Size, string> = {
  sm: 'px-1.5 py-[1px] text-[11px] border-[1.5px] rounded-[3px]',
  md: 'px-2 py-[2px] text-sm border-2 rounded',
  lg: 'px-2.5 py-1 text-lg border-2 rounded-md',
}
</script>

<template>
  <span
    v-if="props.plate"
    class="inline-flex items-center border-bnc-ink bg-[#F5C518] font-mono font-extrabold uppercase tracking-wider text-bnc-ink shadow-sm dark:border-bnc-ink"
    :class="sizeClasses[props.size]"
    :aria-label="`Nomor polisi ${props.plate}`"
  >
    {{ props.plate }}
  </span>
</template>
