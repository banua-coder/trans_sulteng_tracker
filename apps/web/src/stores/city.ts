import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { CITY_PREF, type CitySlug } from '@/types/brt'

export const useCityStore = defineStore('city', () => {
  const slug = ref<CitySlug>('palu')

  const pref = computed(() => CITY_PREF[slug.value])

  function setCity(next: CitySlug) {
    slug.value = next
  }

  return { slug, pref, setCity }
})
