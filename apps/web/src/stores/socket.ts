import { defineStore } from 'pinia'
import { ref } from 'vue'
import { io, type Socket } from 'socket.io-client'
import type { BrtBus } from '@/types/brt'
import { useBrtStore } from './brt'

export type ConnectionState = 'idle' | 'connecting' | 'live' | 'offline'

/** Seconds we wait after `subscribe` before re-emitting once if no
 *  bus event has arrived. Covers the case where the original
 *  `subscribe` reached the proxy but the join was lost (server
 *  restart mid-handshake, room rotation race) without spinning a
 *  retry loop when the upstream simply has no buses to broadcast. */
const RESUBSCRIBE_DELAY_MS = 8_000

export const useSocketStore = defineStore('socket', () => {
  const state = ref<ConnectionState>('idle')
  const viewers = ref<number>(0)
  let sock: Socket | null = null
  let currentPref: string | null = null
  let resubscribeTimer: ReturnType<typeof setTimeout> | null = null
  let firstBusReceived = false

  function clearResubscribe() {
    if (resubscribeTimer != null) {
      clearTimeout(resubscribeTimer)
      resubscribeTimer = null
    }
  }

  /** One-shot retry of `subscribe`. If no bus has reached us by the
   *  time this fires, the server might have dropped us from the
   *  room; re-emit once and stop. If the upstream actually has no
   *  buses, the second emit is a harmless no-op. */
  function scheduleResubscribe(pref: string) {
    clearResubscribe()
    firstBusReceived = false
    resubscribeTimer = setTimeout(() => {
      resubscribeTimer = null
      if (firstBusReceived) return
      if (!sock?.connected) return
      if (currentPref !== pref) return
      sock.emit('subscribe', { pref })
    }, RESUBSCRIBE_DELAY_MS)
  }

  function connect(pref: string) {
    const brt = useBrtStore()

    if (sock && currentPref === pref) return

    // NOTE: do NOT emit a separate `unsubscribe` for the old pref.
    // The proxy's `subscribe` handler already calls `s.leave_all()`
    // before joining the new room. Emitting both ran into a race
    // where the server processed `unsubscribe` AFTER `subscribe`,
    // kicking the client out of the room it had just joined — which
    // is what caused "stuck on waiting bus data" after a city
    // switch. One emit is enough.

    if (!sock) {
      state.value = 'connecting'
      sock = io({ path: '/socket.io', transports: ['websocket'], reconnection: true })

      sock.on('connect', () => {
        state.value = 'live'
        if (currentPref) {
          sock?.emit('subscribe', { pref: currentPref })
          scheduleResubscribe(currentPref)
        }
      })
      sock.on('disconnect', () => {
        state.value = 'offline'
        clearResubscribe()
      })
      sock.on('viewers', (count: number) => {
        viewers.value = count
      })
      sock.on('bus', (payload: BrtBus) => {
        firstBusReceived = true
        clearResubscribe()
        brt.upsertBus(payload)
      })
    }

    currentPref = pref
    if (sock.connected) {
      sock.emit('subscribe', { pref })
      scheduleResubscribe(pref)
    }
  }

  function disconnect() {
    clearResubscribe()
    if (sock) {
      sock.disconnect()
      sock = null
    }
    state.value = 'idle'
    currentPref = null
    firstBusReceived = false
  }

  return { state, viewers, connect, disconnect }
})
