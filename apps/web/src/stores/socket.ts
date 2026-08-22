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

/** How long we let the *initial* handshake keep failing before we
 *  stop pretending it's still "connecting" and admit the connection
 *  is down. socket.io's own `reconnection` option keeps retrying
 *  forever in the background regardless — this timer only controls
 *  how long the UI is allowed to show a spinner for it. Distinct
 *  from `RESUBSCRIBE_DELAY_MS`, which only applies once we're
 *  already connected. */
const CONNECT_TIMEOUT_MS = 10_000

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
  let everConnected = false
  let connectFailTimer: ReturnType<typeof setTimeout> | null = null

  function clearResubscribe() {
    if (resubscribeTimer != null) {
      clearTimeout(resubscribeTimer)
      resubscribeTimer = null
    }
  }

  function clearConnectFailTimer() {
    if (connectFailTimer != null) {
      clearTimeout(connectFailTimer)
      connectFailTimer = null
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
        everConnected = true
        clearConnectFailTimer()
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
      // socket.io retries the *initial* handshake forever on its own
      // (reconnection: true), so a failed handshake alone never fires
      // `disconnect` — only a drop after a prior successful connect
      // does. Without this, a backend that's simply unreachable left
      // the UI stuck on "connecting" indefinitely. Give it
      // CONNECT_TIMEOUT_MS of real attempts before admitting defeat.
      sock.on('connect_error', () => {
        if (everConnected || connectFailTimer != null) return
        connectFailTimer = setTimeout(() => {
          connectFailTimer = null
          if (!sock?.connected) state.value = 'offline'
        }, CONNECT_TIMEOUT_MS)
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

  /** Manual "tap to retry" affordance for the offline badge. Skips
   *  socket.io's exponential backoff and attempts a connection right
   *  now; a no-op if we're already connected or there's no socket. */
  function retry() {
    if (sock && !sock.connected) {
      sock.connect()
    }
  }

  function disconnect() {
    clearResubscribe()
    clearConnectFailTimer()
    inSubscribeGrace.value = false
    if (sock) {
      sock.disconnect()
      sock = null
    }
    state.value = 'idle'
    currentPref = null
    firstBusReceived = false
    everConnected = false
  }

  return { state, viewers, inSubscribeGrace, connect, disconnect, retry }
})
