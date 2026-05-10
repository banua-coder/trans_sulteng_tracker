import { defineStore } from 'pinia'
import { ref } from 'vue'
import { io, type Socket } from 'socket.io-client'
import type { BrtBus } from '@/types/brt'
import { useBrtStore } from './brt'

export type ConnectionState = 'idle' | 'connecting' | 'live' | 'offline'

export const useSocketStore = defineStore('socket', () => {
  const state = ref<ConnectionState>('idle')
  const viewers = ref<number>(0)
  let sock: Socket | null = null
  let currentPref: string | null = null

  function connect(pref: string) {
    const brt = useBrtStore()

    if (sock && currentPref === pref) return
    if (sock && currentPref !== pref) {
      sock.emit('unsubscribe', { pref: currentPref })
    }

    if (!sock) {
      state.value = 'connecting'
      sock = io({ path: '/socket.io', transports: ['websocket'], reconnection: true })

      sock.on('connect', () => {
        state.value = 'live'
        if (currentPref) sock?.emit('subscribe', { pref: currentPref })
      })
      sock.on('disconnect', () => {
        state.value = 'offline'
      })
      sock.on('viewers', (count: number) => {
        viewers.value = count
      })
      sock.on('bus', (payload: BrtBus) => {
        brt.upsertBus(payload)
      })
    }

    currentPref = pref
    if (sock.connected) sock.emit('subscribe', { pref })
  }

  function disconnect() {
    if (sock) {
      sock.disconnect()
      sock = null
    }
    state.value = 'idle'
    currentPref = null
  }

  return { state, viewers, connect, disconnect }
})
