<script setup lang="ts">
/**
 * Pre-ride modal: warns about GPS + screen-on battery cost.
 * Surfaces only on the first Mulai Perjalanan per browser
 * (persisted via cektrans:rideBatteryWarned). Dismissible
 * permanently with "Jangan tampilkan lagi" checkbox.
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ confirm: [dontShowAgain: boolean] }>()

const { t } = useI18n()
const dontShowAgain = ref(true)
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[1300] flex items-end justify-center bg-bnc-ink/40 p-4 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
      >
        <div class="w-full max-w-sm rounded-[var(--radius-md)] bg-bnc-paper p-4 shadow-[var(--shadow-elevated)] dark:bg-bnc-stone-900">
          <h3 class="font-display text-base font-bold tracking-tight">
            {{ t('ride.battery.title') }}
          </h3>
          <p class="mt-2 text-sm text-bnc-stone-600 dark:text-bnc-stone-300">
            {{ t('ride.battery.body') }}
          </p>
          <label class="mt-3 flex cursor-pointer items-center gap-2 text-xs">
            <input
              v-model="dontShowAgain"
              type="checkbox"
              class="h-4 w-4 accent-bnc-primary"
            />
            <span>{{ t('ride.battery.dontShow') }}</span>
          </label>
          <button
            type="button"
            class="mt-4 w-full rounded-md bg-bnc-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90"
            @click="emit('confirm', dontShowAgain)"
          >
            {{ t('ride.battery.confirm') }}
          </button>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 180ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
