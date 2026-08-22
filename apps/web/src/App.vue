<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopBar from '@/components/TopBar.vue'
import OperatingBanner from '@/components/OperatingBanner.vue'
import { useCityStore } from '@/stores/city'
import { useBrtStore } from '@/stores/brt'
import { useTour } from '@/composables/useTour'
import type { CitySlug } from '@/types/brt'

const route = useRoute()
const router = useRouter()
const city = useCityStore()
const brt = useBrtStore()
const tour = useTour()

function syncFromRoute() {
  const slug = route.params.city as CitySlug | undefined
  if (slug === 'palu' || slug === 'donggala') {
    if (city.slug !== slug) city.setCity(slug)
  }
}

// Most tour steps target city-view-only controls (map toggles,
// filters, export); only the settings button lives in the global
// TopBar. Gating to the city route (rather than firing on whatever
// route happens to be mounted first) avoids a first-time visitor
// landing on Home and getting a single orphaned coach-mark for a
// secondary feature before they've even picked a city.
let tourAttempted = false
function maybeStartTour() {
  if (tourAttempted || route.name !== 'city') return
  tourAttempted = true
  void tour.maybeStartForVersion()
}

onMounted(() => {
  syncFromRoute()
  void brt.loadCities()
  maybeStartTour()
})
watch(() => route.params.city, syncFromRoute)
watch(() => route.name, maybeStartTour)

watch(
  () => city.slug,
  (slug) => {
    if (route.name === 'city' && route.params.city !== slug) {
      router.replace({ name: 'city', params: { city: slug } })
    }
  },
)
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <TopBar class="app-chrome" />
    <OperatingBanner class="app-chrome" />
    <main class="relative flex-1">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Hide the app shell when printing so the browser's print pipeline
   only emits the route content. Without this, the global TopBar +
   OperatingBanner pile onto page 1 of the corridor booklet. */
@media print {
  .app-chrome { display: none !important; }
}
</style>
