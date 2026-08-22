import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

type Handler = (...args: unknown[]) => void

interface FakeSocket {
  connected: boolean
  on: (event: string, cb: Handler) => void
  emit: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  __trigger: (event: string, ...args: unknown[]) => void
}

const { ioMock, getLastSocket } = vi.hoisted(() => {
  let last: FakeSocket | null = null
  const ioMock = vi.fn(() => {
    const handlers: Record<string, Handler[]> = {}
    const socket: FakeSocket = {
      connected: false,
      on(event, cb) {
        ;(handlers[event] ??= []).push(cb)
      },
      emit: vi.fn(),
      connect: vi.fn(() => {
        socket.connected = true
      }),
      disconnect: vi.fn(() => {
        socket.connected = false
      }),
      __trigger(event, ...args) {
        handlers[event]?.forEach((cb) => cb(...args))
      },
    }
    last = socket
    return socket
  })
  return { ioMock, getLastSocket: () => last as FakeSocket }
})

vi.mock('socket.io-client', () => ({ io: ioMock }))

// Import after the mock so the store picks up the mocked `io`.
const { useSocketStore } = await import('./socket')

describe('useSocketStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    ioMock.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reaches offline within a bounded time when the initial handshake never connects', () => {
    const store = useSocketStore()
    store.connect('12')
    const sock = getLastSocket()

    expect(store.state).toBe('connecting')

    sock.__trigger('connect_error', new Error('xhr poll error'))
    // Not yet — still within the bounded grace window.
    expect(store.state).toBe('connecting')

    vi.runAllTimers()

    expect(store.state).toBe('offline')
  })

  it('does not flip to offline if a connect_error is followed by a successful connect before the timeout', () => {
    const store = useSocketStore()
    store.connect('12')
    const sock = getLastSocket()

    sock.__trigger('connect_error', new Error('xhr poll error'))
    vi.advanceTimersByTime(1_000)
    sock.connected = true
    sock.__trigger('connect')

    vi.runAllTimers()

    expect(store.state).toBe('live')
  })

  it('still reaches offline immediately on disconnect after a prior successful connect', () => {
    const store = useSocketStore()
    store.connect('12')
    const sock = getLastSocket()

    sock.connected = true
    sock.__trigger('connect')
    expect(store.state).toBe('live')

    sock.__trigger('disconnect')
    expect(store.state).toBe('offline')
  })

  it('retry() forces an immediate connection attempt when not connected', () => {
    const store = useSocketStore()
    store.connect('12')
    const sock = getLastSocket()

    sock.__trigger('connect_error', new Error('xhr poll error'))
    vi.runAllTimers()
    expect(store.state).toBe('offline')

    store.retry()

    expect(sock.connect).toHaveBeenCalled()
  })
})
