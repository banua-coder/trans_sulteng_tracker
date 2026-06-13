import { defineStore } from 'pinia'
import { ref } from 'vue'
import { io, type Socket } from 'socket.io-client'
import type { BrtBus } from '@/types/brt'
import { useBrtStore } from './brt'

export type ConnectionState = 'idle' | 'connecting' | 'live' | 'offline'

/** Seconds we wait after `subscribe` before:
 *   1) re-emitting `subscribe` once (covers a lost room join), and
 *   2) flipping `inSubscribeGrace` to false so the loading badge can
 *      transition out of its "connecting" pulse into the steady
 *      "waiting" state.
 *  Same number for both because they share the same intuition:
 *  if no bus has arrived in 8 s we've exhausted the "still
 *  spinning up" excuse. */
const RESUBSCRIBE_DELAY_MS = 8_000

export const useSocketStore = defineStore('socket', () => {
  const state = ref<ConnectionState>('idle')
  const viewers = ref<number>(0)
  /** True while we're within the 8 s grace window after `subscribe`.
   *  The BusDataBadge keeps showing "Memuat data bus…" while this is
   *  true so the badge doesn't briefly flash a wrong "no buses yet"
   *  message before the first bus event lands. */
  const inSubscribeGrace = ref(false)
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
    inSubscribeGrace.value = true
    resubscribeTimer = setTimeout(() => {
      resubscribeTimer = null
      inSubscribeGrace.value = false
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
        inSubscribeGrace.value = false
        clearResubscribe()
      })
      sock.on('viewers', (count: number) => {
        viewers.value = count
      })
      sock.on('bus', (payload: BrtBus) => {
        firstBusReceived = true
        inSubscribeGrace.value = false
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
    inSubscribeGrace.value = false
    if (sock) {
      sock.disconnect()
      sock = null
    }
    state.value = 'idle'
    currentPref = null
    firstBusReceived = false
  }

  return { state, viewers, inSubscribeGrace, connect, disconnect }
})
