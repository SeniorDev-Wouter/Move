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
  const broadcastSchedule = vi.fn()
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
      broadcastSchedule,
      close,
    }
  })
  return { relayAction, broadcastSnooze, broadcastSchedule, close, ctrl, createEngineChannel }
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

/** Default state with freshly cloned exercises so tests can mutate `deleted`. */
function cloneState(): MoveState {
  const s = createDefaultState()
  return { ...s, exercises: s.exercises.map((e) => ({ ...e })) }
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

  it('exposes nextFireAt ≈ now + interval after start and broadcasts it as leader', async () => {
    const { result } = renderEngine()
    await startEngine(result)

    const now = Date.now()
    expect(result.current.nextFireAt).not.toBeNull()
    expect(Math.abs(result.current.nextFireAt! - (now + INTERVAL_MS))).toBeLessThan(1000)
    expect(chan.broadcastSchedule).toHaveBeenCalledWith(result.current.nextFireAt)
  })

  it('advances nextFireAt to the next tick after one fires', async () => {
    const { result } = renderEngine()
    await startEngine(result)
    const first = result.current.nextFireAt!

    act(() => vi.advanceTimersByTime(INTERVAL_MS))

    expect(result.current.nextFireAt).not.toBeNull()
    expect(Math.abs(result.current.nextFireAt! - (first + INTERVAL_MS))).toBeLessThan(1000)
  })

  it('reflects the sooner snooze time then recomputes to the tick after it re-fires', async () => {
    const { result } = renderEngine()
    await startEngine(result)
    act(() => vi.advanceTimersByTime(INTERVAL_MS))
    const tickAt = result.current.nextFireAt!
    const cur = result.current.current!

    act(() => {
      result.current.handleAction({
        action: 'snooze',
        occurrenceId: cur.occurrenceId,
        exerciseId: cur.exercise.id,
      })
    })
    // The snooze (5 min) is sooner than the next interval tick (30 min).
    expect(result.current.nextFireAt!).toBeLessThan(tickAt)

    act(() => vi.advanceTimersByTime(SNOOZE_MS))
    // After the snooze re-fires, nextFireAt recomputes back to the interval tick.
    expect(result.current.nextFireAt).toBe(tickAt)
  })

  it('nextFireAt is null after stop', async () => {
    const { result } = renderEngine()
    await startEngine(result)
    expect(result.current.nextFireAt).not.toBeNull()

    act(() => result.current.stop())

    expect(result.current.nextFireAt).toBeNull()
  })

  it('nextFireAt is null after losing leadership (no stale tick)', async () => {
    const { result } = renderEngine()
    await startEngine(result)
    expect(result.current.nextFireAt).not.toBeNull()

    act(() => {
      chan.ctrl.leader = false
      chan.ctrl.handlers.onLoseLeader?.(undefined)
    })

    expect(result.current.nextFireAt).toBeNull()
  })

  it('clears current when its exercise becomes soft-deleted', async () => {
    const state = cloneState()
    const recordAction = vi.fn()
    const trim = vi.fn()
    const onNotice = vi.fn()
    const { result, rerender } = renderHook((props) => useReminderEngine(props), {
      initialProps: { state, recordAction, trim, swRegistration: null, onNotice },
    })
    await act(async () => {
      await result.current.start()
    })
    act(() => vi.advanceTimersByTime(INTERVAL_MS))
    const cur = result.current.current!

    const next = {
      ...state,
      exercises: state.exercises.map((e) => (e.id === cur.exercise.id ? { ...e, deleted: true } : e)),
    }
    act(() => rerender({ state: next, recordAction, trim, swRegistration: null, onNotice }))

    expect(result.current.current).toBeNull()
  })

  it('does not arm an adopted snooze for a soft-deleted exercise', async () => {
    const state = cloneState()
    const target = state.exercises[0]
    target.deleted = true
    const { result } = renderEngine(state)
    await startEngine(result)
    const before = result.current.nextFireAt

    act(() => {
      chan.ctrl.handlers.onAdoptSnooze?.({
        type: 'snooze',
        key: 'k-adopt',
        exerciseId: target.id,
        fireAt: Date.now() + SNOOZE_MS,
      })
    })
    act(() => vi.advanceTimersByTime(SNOOZE_MS + 10))

    expect(noti.fireReminder).not.toHaveBeenCalled()
    // No phantom snooze time was recorded.
    expect(result.current.nextFireAt).toBe(before)
  })

  it('a soft-deleted snooze does not fire and drops its phantom time (fire-callback guard)', async () => {
    const state = cloneState()
    const target = state.exercises[0]
    const { result } = renderEngine(state)
    await startEngine(result)
    const tickAt = result.current.nextFireAt!

    // Arm a snooze while the exercise is present (adopt path arms it).
    act(() => {
      chan.ctrl.handlers.onAdoptSnooze?.({
        type: 'snooze',
        key: 'k-fire',
        exerciseId: target.id,
        fireAt: Date.now() + SNOOZE_MS,
      })
    })
    expect(result.current.nextFireAt!).toBeLessThan(tickAt)

    // Soft-delete in the state the timer reads, without a rerender (no disarm effect).
    target.deleted = true
    act(() => vi.advanceTimersByTime(SNOOZE_MS + 10))

    expect(noti.fireReminder).not.toHaveBeenCalled()
    // The phantom snooze fireAt was cleared; nextFireAt falls back to the tick.
    expect(result.current.nextFireAt).toBe(tickAt)
  })

  it('a follower mirrors an inbound schedule and never broadcasts its own', async () => {
    chan.ctrl.leader = false
    const { result } = renderEngine()
    await startEngine(result)
    expect(result.current.nextFireAt).toBeNull() // a follower does not schedule locally

    act(() => chan.ctrl.handlers.onSchedule?.({ type: 'schedule', nextFireAt: 12_345 }))
    expect(result.current.nextFireAt).toBe(12_345)

    act(() => result.current.stop())
    expect(chan.broadcastSchedule).not.toHaveBeenCalled()
  })

  it('the leader ignores an inbound schedule — its local value wins', async () => {
    const { result } = renderEngine()
    await startEngine(result)
    const local = result.current.nextFireAt

    act(() => chan.ctrl.handlers.onSchedule?.({ type: 'schedule', nextFireAt: 999 }))

    expect(result.current.nextFireAt).toBe(local)
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
