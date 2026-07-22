import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionMsg, SnoozeMsg } from './engineChannel'

// newId is mocked so tab priorities (and action ids) are deterministic.
vi.mock('./id', () => ({ newId: vi.fn() }))
import { newId } from './id'
import { createEngineChannel } from './engineChannel'

const newIdMock = vi.mocked(newId)

const ELECTION_MS = 500
const FAILOVER_MS = 6000
const RETRY_MS = 1000

type Listener = (e: MessageEvent) => void

/** A synchronous BroadcastChannel mock that fans messages to same-named peers. */
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = []
  static registry = new Map<string, Set<FakeBroadcastChannel>>()

  private listeners = new Set<Listener>()
  private alive = true

  constructor(public name: string) {
    let peers = FakeBroadcastChannel.registry.get(name)
    if (!peers) {
      peers = new Set()
      FakeBroadcastChannel.registry.set(name, peers)
    }
    peers.add(this)
    FakeBroadcastChannel.instances.push(this)
  }

  postMessage(data: unknown): void {
    if (!this.alive) return
    const peers = FakeBroadcastChannel.registry.get(this.name)
    if (!peers) return
    for (const peer of peers) {
      if (peer === this || !peer.alive) continue
      const event = { data } as MessageEvent
      for (const listener of peer.listeners) listener(event)
    }
  }

  addEventListener(type: string, fn: Listener): void {
    if (type === 'message') this.listeners.add(fn)
  }

  removeEventListener(type: string, fn: Listener): void {
    if (type === 'message') this.listeners.delete(fn)
  }

  close(): void {
    this.alive = false
    FakeBroadcastChannel.registry.get(this.name)?.delete(this)
  }

  /** Simulate a tab dying without a clean resign (no more sends or receives). */
  kill(): void {
    this.alive = false
  }
}

let ids: string[]

beforeEach(() => {
  vi.useFakeTimers()
  FakeBroadcastChannel.instances = []
  FakeBroadcastChannel.registry = new Map()
  ids = []
  let auto = 0
  newIdMock.mockImplementation(() => ids.shift() ?? `auto-${auto++}`)
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('createEngineChannel election', () => {
  it('elects the lowest tabPriority regardless of creation order', () => {
    ids = ['b-high', 'a-low']
    const first = createEngineChannel({})
    const second = createEngineChannel({})

    vi.advanceTimersByTime(ELECTION_MS + 10)

    expect(second.isLeader()).toBe(true)
    expect(first.isLeader()).toBe(false)
  })

  it('re-elects after a heartbeat timeout', () => {
    ids = ['a', 'b']
    const a = createEngineChannel({})
    const b = createEngineChannel({})
    vi.advanceTimersByTime(ELECTION_MS + 10)
    expect(a.isLeader()).toBe(true)

    FakeBroadcastChannel.instances[0].kill() // leader stops heartbeating
    vi.advanceTimersByTime(FAILOVER_MS + ELECTION_MS + 20)

    expect(b.isLeader()).toBe(true)
  })

  it('re-elects after an explicit resign', () => {
    ids = ['a', 'b']
    const a = createEngineChannel({})
    const b = createEngineChannel({})
    vi.advanceTimersByTime(ELECTION_MS + 10)
    expect(a.isLeader()).toBe(true)

    a.close() // clean shutdown broadcasts a resign
    vi.advanceTimersByTime(ELECTION_MS + 10)

    expect(b.isLeader()).toBe(true)
  })
})

describe('createEngineChannel action relay', () => {
  it('applies a relayed action exactly once across a leader death and retry', () => {
    ids = ['a', 'b', 'c', 'evt1']
    const applied: ActionMsg[] = []
    const onAction = (msg: ActionMsg) => applied.push(msg)
    const a = createEngineChannel({ onAction })
    const b = createEngineChannel({ onAction })
    const c = createEngineChannel({ onAction })
    vi.advanceTimersByTime(ELECTION_MS + 10)
    expect(a.isLeader()).toBe(true)

    // Leader dies before it can process anything; C relays regardless.
    FakeBroadcastChannel.instances[0].kill()
    c.relayAction({ action: 'done', occurrenceId: 'occ1', exerciseId: 'ex1' })

    // Failover promotes B, whose first received retry applies the action.
    vi.advanceTimersByTime(FAILOVER_MS + ELECTION_MS + RETRY_MS + 50)
    expect(b.isLeader()).toBe(true)
    expect(applied).toHaveLength(1)
    expect(applied[0].actionEventId).toBe('evt1')

    // Continued retries must not double-apply.
    vi.advanceTimersByTime(RETRY_MS * 5)
    expect(applied).toHaveLength(1)
  })
})

describe('createEngineChannel snooze adoption', () => {
  it('adopts a still-future snooze when a new leader is elected', () => {
    ids = ['a', 'b']
    const adopted: SnoozeMsg[] = []
    const a = createEngineChannel({})
    const b = createEngineChannel({ onAdoptSnooze: (msg) => adopted.push(msg) })
    vi.advanceTimersByTime(ELECTION_MS + 10)
    expect(a.isLeader()).toBe(true)

    a.broadcastSnooze({ key: 'k1', exerciseId: 'ex1', fireAt: Date.now() + 3_600_000 })
    FakeBroadcastChannel.instances[0].kill()
    vi.advanceTimersByTime(FAILOVER_MS + ELECTION_MS + 20)

    expect(b.isLeader()).toBe(true)
    expect(adopted.map((s) => s.key)).toEqual(['k1'])
  })
})

describe('createEngineChannel shim', () => {
  it('reports isLeader() === true when BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const channel = createEngineChannel({})
    expect(channel.isLeader()).toBe(true)
    expect(() => channel.close()).not.toThrow()
  })
})
