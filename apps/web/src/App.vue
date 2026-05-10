<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopBar from '@/components/TopBar.vue'
import OperatingBanner from '@/components/OperatingBanner.vue'
import { useCityStore } from '@/stores/city'
import type { CitySlug } from '@/types/brt'

const route = useRoute()
const router = useRouter()
const city = useCityStore()

function syncFromRoute() {
  const slug = route.params.city as CitySlug | undefined
  if (slug === 'palu' || slug === 'donggala') {
    if (city.slug !== slug) city.setCity(slug)
  }
}

onMounted(syncFromRoute)
watch(() => route.params.city, syncFromRoute)

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
    <TopBar />
    <OperatingBanner />
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
</style>
