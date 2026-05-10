<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const open = ref(false)
</script>

<template>
  <div
    class="pointer-events-auto absolute bottom-3 left-3 z-[800] flex flex-col gap-1.5"
    aria-label="Map legend"
  >
    <button
      type="button"
      class="grid h-9 w-9 place-items-center rounded-full border border-bnc-stone-200 bg-white/95 text-bnc-stone-600 shadow-[var(--shadow-elevated)] transition-colors hover:bg-bnc-stone-100 dark:border-bnc-stone-800 dark:bg-bnc-stone-900/95 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
      :aria-expanded="open"
      :aria-label="t('legend.title')"
      @click="open = !open"
    >
      <svg
        class="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5h.01M11 11h1v5h1" />
      </svg>
    </button>

    <transition name="legend-pop">
      <div
        v-if="open"
        class="w-[180px] rounded-md border border-bnc-stone-200 bg-white/95 p-3 shadow-[var(--shadow-elevated)] backdrop-blur dark:border-bnc-stone-800 dark:bg-bnc-stone-900/95"
        role="dialog"
      >
        <p class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
          {{ t('legend.title') }}
        </p>
        <ul class="mt-2 flex flex-col gap-2 text-xs">
          <li class="flex items-center gap-2">
            <span class="legend-bus" aria-hidden>
              <span class="legend-bus-disc" />
            </span>
            <span>{{ t('legend.busLive') }}</span>
          </li>
          <li class="flex items-center gap-2">
            <span class="legend-bus stale" aria-hidden>
              <span class="legend-bus-disc" />
            </span>
            <span>{{ t('legend.busStale') }}</span>
          </li>
          <li class="flex items-center gap-2">
            <span class="legend-halte" aria-hidden />
            <span>{{ t('legend.halte') }}</span>
          </li>
          <li class="flex items-center gap-2">
            <span class="legend-line" aria-hidden />
            <span>{{ t('legend.corridor') }}</span>
          </li>
        </ul>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.legend-bus {
  display: inline-grid;
  width: 22px;
  height: 22px;
  place-items: center;
}
.legend-bus-disc {
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  background: var(--color-bnc-accent);
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
}
.legend-bus.stale .legend-bus-disc {
  filter: grayscale(0.85) opacity(0.55);
  background-image: repeating-linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.18) 0 3px,
    transparent 3px 6px
  );
}
.legend-halte {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: var(--color-bnc-accent);
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px var(--color-bnc-stone-300);
}
.legend-line {
  display: inline-block;
  width: 22px;
  height: 4px;
  border-radius: 9999px;
  background: var(--color-bnc-accent);
}
.legend-pop-enter-active,
.legend-pop-leave-active {
  transition: opacity 160ms ease, transform 200ms ease;
}
.legend-pop-enter-from,
.legend-pop-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.96);
}
</style>
