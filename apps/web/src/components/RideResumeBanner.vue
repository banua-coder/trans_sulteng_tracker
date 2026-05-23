<script setup lang="ts">
/**
 * Mounts once in CityView. Reads the persisted ride snapshot on
 * boot; if a recent (<6h) non-arrived ride exists, surfaces a thin
 * banner letting the user resume or discard. Auto-hides once the
 * user decides or once the ride is no longer resumable.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRideStore } from '@/stores/ride'

const { t } = useI18n()
const ride = useRideStore()

// Capture the snapshot freshly on mount so we can show the banner
// independent of whether the user has already cleared/started.
const dismissed = ref(false)
const visible = computed(() => !dismissed.value && !ride.isActive && ride.resumeIsAvailable())

const destination = computed(() => {
  const plan = ride.state.plan
  return plan?.steps[plan.steps.length - 1]?.toName ?? '—'
})

async function resume() {
  await ride.resumeFromSnapshot()
  dismissed.value = true
}
function discard() {
  ride.discardSnapshot()
  dismissed.value = true
}
</script>

<template>
  <div
    v-if="visible"
    class="pointer-events-auto fixed inset-x-2 top-[calc(var(--header-h)+8px)] z-[1100] mx-auto flex max-w-md items-center gap-2 rounded-md border border-bnc-stone-300 bg-bnc-paper px-3 py-2 shadow-[var(--shadow-elevated)] dark:border-bnc-stone-700 dark:bg-bnc-stone-900"
    role="region"
    :aria-label="t('ride.resume.title')"
  >
    <div class="min-w-0 flex-1">
      <p class="font-mono text-[10px] uppercase tracking-wider text-bnc-stone-500">
        {{ t('ride.resume.title') }}
      </p>
      <p class="truncate text-xs">
        {{ t('ride.resume.body', { destination }) }}
      </p>
    </div>
    <button
      type="button"
      class="shrink-0 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-bnc-stone-600 transition-colors hover:bg-bnc-stone-100 dark:text-bnc-stone-300 dark:hover:bg-bnc-stone-800"
      @click="discard"
    >
      {{ t('ride.resume.discard') }}
    </button>
    <button
      type="button"
      class="shrink-0 rounded-md bg-bnc-accent px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90"
      @click="resume"
    >
      {{ t('ride.resume.action') }}
    </button>
  </div>
</template>
