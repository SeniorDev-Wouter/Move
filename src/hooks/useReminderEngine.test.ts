import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoveState } from '../types'
import { createDefaultState, MAX_DELAY_MS } from '../catalog'
import { useReminderEngine } from './useReminderEngine'

// --- Mocks ---------------------------------------------------------------

const noti = vi.hoisted(() => ({
  fireReminder: vi.fn().mockResolvedValue(undefined),
  requestPermission: vi.fn().mockResolvedValue('granted'),
}))
vi.mock('../notifications', () => ({
  fireReminder: noti.fireReminder,
  requestPermission: noti.requestPermission,
}))

const snd = vi.hoisted(() => ({ playDing: vi.fn() }))
vi.mock('../sound', () => ({ playDing: snd.playDing }))

const chan = vi.hoisted(() => {
  const relayAction = vi.fn()
  const broadcastSnooze = vi.fn()
  const close = vi.fn()
  const ctrl: { leader: boolean; handlers: Record<string, ((m: unknown) => void) | undefined> } = {
    leader: true,
    handlers: {},
  }
  const createEngineChannel = vi.fn((handlers) => {
    ctrl.handlers = handlers
    return {
      isLeader: () => ctrl.leader,
      relayAction,
      broadcastSnooze,
      close,
    }
  })
  return { relayAction, broadcastSnooze, close, ctrl, createEngineChannel }
})
vi.mock('../engineChannel', () => ({ createEngineChannel: chan.createEngineChannel }))

// --- Harness -------------------------------------------------------------

const INTERVAL_MS = 30 * 60_000
const SNOOZE_MS = 5 * 60_000

function renderEngine(state: MoveState = createDefaultState()) {
  const recordAction = vi.fn()
  const trim = vi.fn()
  const onNotice = vi.fn()
  const view = renderHook(() =>
    useReminderEngine({ state, recordAction, trim, swRegistration: null, onNotice }),
  )
  return { ...view, recordAction, trim, onNotice }
}

async function startEngine(result: { current: { start: () => Promise<void> } }) {
  await act(async () => {
    await result.current.start()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  chan.ctrl.leader = true
  chan.ctrl.handlers = {}
  vi.clearAllMocks()
  noti.fireReminder.mockResolvedValue(undefined)
  noti.requestPermission.mockResolvedValue('granted')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useReminderEngine', () => {
  it('fires a reminder and plays the ding on an interval tick', async () => {
    const { result } = renderEngine()
    await startEngine(result)

    act(() => vi.advanceTimersByTime(INTERVAL_MS))

    expect(noti.fireReminder).toHaveBeenCalledTimes(1)
    expect(snd.playDing).toHaveBeenCalledTimes(1)
    expect(result.current.current).not.toBeNull()
  })

  it('re-fires a snooze with a NEW occurrenceId', async () => {
    const { result } = renderEngine()
    await startEngine(result)

    act(() => vi.advanceTimersByTime(INTERVAL_MS))
    const first = result.current.current!
    const firstOcc = noti.fireReminder.mock.calls[0][2]

    act(() => {
      result.current.handleAction({
        action: 'snooze',
        occurrenceId: first.occurrenceId,
        exerciseId: first.exercise.id,
      })
    })
    expect(chan.broadcastSnooze).toHaveBeenCalledTimes(1)
    expect(result.current.current).toBeNull() // active reminder dismissed

    act(() => vi.advanceTimersByTime(SNOOZE_MS))

    expect(noti.fireReminder).toHaveBeenCalledTimes(2)
    const secondOcc = noti.fireReminder.mock.calls[1][2]
    expect(secondOcc).not.toBe(firstOcc)
  })

  it('clamps a huge interval to MAX_DELAY_MS', async () => {
    const state = createDefaultState()
    state.settings.intervalMinutes = 1e9
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const { result } = renderEngine(state)
    await startEngine(result)

    expect(setTimeoutSpy.mock.calls.some((c) => c[1] === MAX_DELAY_MS)).toBe(true)
  })

  it('records a stale action but does not clear the active reminder', async () => {
    const { result, recordAction } = renderEngine()
    await startEngine(result)
    act(() => vi.advanceTimersByTime(INTERVAL_MS))
    const active = result.current.current!

    act(() => {
      result.current.handleAction({
        action: 'done',
        occurrenceId: 'stale-occurrence',
        exerciseId: 'ex-neck-rolls',
      })
    })

    expect(recordAction).toHaveBeenCalledWith('stale-occurrence', 'ex-neck-rolls', 'done')
    expect(result.current.current?.occurrenceId).toBe(active.occurrenceId)
  })

  it('advances on shuffle without recording done', async () => {
    const { result, recordAction } = renderEngine()
    await startEngine(result)
    act(() => vi.advanceTimersByTime(INTERVAL_MS))
    const active = result.current.current!
    recordAction.mockClear()

    act(() => {
      result.current.handleAction({
        action: 'shuffle',
        occurrenceId: active.occurrenceId,
        exerciseId: active.exercise.id,
      })
    })

    expect(recordAction).not.toHaveBeenCalled()
    expect(result.current.current).not.toBeNull()
    expect(result.current.current!.occurrenceId).not.toBe(active.occurrenceId)
  })

  it('relays and applies no transition when not the leader', async () => {
    chan.ctrl.leader = false
    const { result, recordAction } = renderEngine()
    await startEngine(result)

    act(() => {
      result.current.handleAction({ action: 'done', occurrenceId: 'o1', exerciseId: 'e1' })
    })

    expect(recordAction).toHaveBeenCalledWith('o1', 'e1', 'done')
    expect(chan.relayAction).toHaveBeenCalledWith({
      action: 'done',
      occurrenceId: 'o1',
      exerciseId: 'e1',
    })
    expect(result.current.current).toBeNull()
  })

  it('lets a promoted peer continue the schedule after a leadership change', async () => {
    chan.ctrl.leader = false
    const { result } = renderEngine()
    await startEngine(result)

    // As a follower, no reminders fire.
    act(() => vi.advanceTimersByTime(INTERVAL_MS))
    expect(noti.fireReminder).not.toHaveBeenCalled()

    // Promoted to leader → resume the loop.
    act(() => {
      chan.ctrl.leader = true
      chan.ctrl.handlers.onBecomeLeader?.(undefined)
    })
    act(() => vi.advanceTimersByTime(INTERVAL_MS))
    expect(noti.fireReminder).toHaveBeenCalledTimes(1)
  })

  it('reschedules the next tick even when the pool is empty', async () => {
    const state = createDefaultState()
    state.settings.activeContext = 'outdoors' // known context, no matching exercises
    const { result, onNotice } = renderEngine(state)
    await startEngine(result)

    act(() => vi.advanceTimersByTime(INTERVAL_MS))
    act(() => vi.advanceTimersByTime(INTERVAL_MS))

    expect(noti.fireReminder).not.toHaveBeenCalled()
    expect(snd.playDing).not.toHaveBeenCalled()
    expect(onNotice.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('drains a pending SW-queued action on mount', () => {
    const listeners = new Set<(e: MessageEvent) => void>()
    const sw = {
      addEventListener: (_t: string, fn: (e: MessageEvent) => void) => listeners.add(fn),
      removeEventListener: (_t: string, fn: (e: MessageEvent) => void) => listeners.delete(fn),
    }
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true })

    try {
      const { recordAction } = renderEngine()
      act(() => {
        const event = {
          data: { type: 'reminder-action', action: 'done', occurrenceId: 'sw-1', exerciseId: 'ex-1' },
        } as MessageEvent
        for (const fn of listeners) fn(event)
      })
      expect(recordAction).toHaveBeenCalledWith('sw-1', 'ex-1', 'done')
    } finally {
      // @ts-expect-error - remove the stubbed property
      delete navigator.serviceWorker
    }
  })
})
