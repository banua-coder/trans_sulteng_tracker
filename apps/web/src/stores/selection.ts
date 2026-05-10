import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useBrtStore } from './brt'

export type SelectionKind = 'bus' | 'halte' | null

export const useSelectionStore = defineStore('selection', () => {
  const kind = ref<SelectionKind>(null)
  const id = ref<string | null>(null)

  const brt = useBrtStore()

  const selectedBus = computed(() => {
    if (kind.value !== 'bus' || !id.value) return null
    return brt.buses.get(id.value) ?? null
  })

  const selectedHalte = computed(() => {
    if (kind.value !== 'halte' || !id.value) return null
    return brt.halte.find((h) => h.sh_id === id.value) ?? null
  })

  function selectBus(imei: string) {
    kind.value = 'bus'
    id.value = imei
  }

  function selectHalte(sh_id: string) {
    kind.value = 'halte'
    id.value = sh_id
  }

  function clear() {
    kind.value = null
    id.value = null
  }

  return { kind, id, selectedBus, selectedHalte, selectBus, selectHalte, clear }
})
