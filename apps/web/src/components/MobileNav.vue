<script setup lang="ts">
/**
 * Phone bottom navigation: Routes, Stops, Plan. It replaces the pill
 * tabs that sat inside the sheet, so the thumb reaches every feature
 * and the sheet keeps its room for content. Tapping a tab while a
 * detail (bus, stop, route, plan) is open leaves that detail first,
 * like the desktop sidebar tabs do.
 */
import { useI18n } from 'vue-i18n'
import { useFocusStore } from '@/stores/focus'
import { useSelectionStore } from '@/stores/selection'
import { useTripStore } from '@/stores/trip'
import { useUiStore } from '@/stores/ui'
import SidebarIcon from '@/components/SidebarIcon.vue'

const { t } = useI18n()
const ui = useUiStore()
const selection = useSelectionStore()
const focus = useFocusStore()
const trip = useTripStore()

const items = [
  { id: 'routes', icon: 'routes', label: 'sidebar.routes' },
  { id: 'halte', icon: 'stops', label: 'sidebar.stops' },
  { id: 'plan', icon: 'plan', label: 'sidebar.plan' },
] as const

function pick(id: (typeof items)[number]['id']) {
  selection.clear()
  focus.clear()
  trip.selectPlan(null)
  ui.mobileTab = id
  ui.openSheet()
}
</script>

<template>
  <nav
    id="mobile-nav"
    class="fixed inset-x-0 bottom-0 z-[950] grid grid-cols-3 border-t border-bnc-stone-200 bg-bnc-paper pb-[env(safe-area-inset-bottom)] dark:border-bnc-stone-800 dark:bg-bnc-stone-900 lg:hidden"
    :aria-label="t('sidebar.nav')"
  >
    <button
      v-for="it in items"
      :key="it.id"
      type="button"
      class="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors"
      :class="ui.mobileTab === it.id ? 'text-bnc-accent' : 'text-bnc-stone-500'"
      :aria-current="ui.mobileTab === it.id ? 'page' : undefined"
      @click="pick(it.id)"
    >
      <span
        class="grid h-7 w-14 place-items-center rounded-full transition-colors"
        :class="ui.mobileTab === it.id ? 'bg-bnc-accent/12' : ''"
      >
        <SidebarIcon :name="it.icon" />
      </span>
      {{ t(it.label) }}
    </button>
  </nav>
</template>
