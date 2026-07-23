import { useCallback, useEffect, useRef, useState } from 'react'
import type { Exercise, MoveState, ReminderAction } from '../types'
import type { ActionMsg, EngineChannel, ScheduleMsg, SnoozeMsg } from '../engineChannel'
import { eligiblePool, selectNext } from '../selection'
import { createEngineChannel } from '../engineChannel'
import { fireReminder, requestPermission } from '../notifications'
import { playDing } from '../sound'
import { MAX_DELAY_MS } from '../catalog'
import { newId } from '../id'

/** The reminder currently on screen — ephemeral, NEVER persisted. */
export type CurrentReminder = { exercise: Exercise; occurrenceId: string }

/** A reminder action addressed at a specific occurrence. */
export type ActionPayload = {
  action: ReminderAction
  occurrenceId: string
  exerciseId: string
}

export type ReminderEngineProps = {
  /** The owned, persisted state (from useMove). */
  state: MoveState
  /** Append a history entry (safe from any tab; storage merge dedupes). */
  recordAction: (occurrenceId: string, exerciseId: string, action: ReminderAction) => void
  /** Leader-only history trim (from useMove). Called only on the leader path. */
  trim: () => void
  /** The active SW registration, used for rich notifications. */
  swRegistration?: ServiceWorkerRegistration | null
  /** Optional assistant notice sink (e.g. the empty-pool message). */
  onNotice?: (message: string) => void
}

const EMPTY_POOL_NOTICE = 'No eligible exercises — adjust your loadout.'

/** Clamp a delay into a safe, non-negative setTimeout range. */
function clampDelay(ms: number): number {
  if (!(ms > 0)) return 0
  return Math.min(ms, MAX_DELAY_MS)
}

/**
 * Drive reminders in the elected leader tab only. Owns ephemeral running/current
 * state (never persisted); schedules the interval loop and snooze re-fires with
 * setTimeout delays clamped to MAX_DELAY_MS; relays actions from non-leader tabs
 * and applies leader-only state transitions; adopts a snooze on failover; and
 * drains SW-queued notification actions on mount.
 */
export function useReminderEngine(props: ReminderEngineProps) {
  const { state, recordAction, trim, swRegistration, onNotice } = props

  const [running, setRunning] = useState(false)
  const [current, setCurrentState] = useState<CurrentReminder | null>(null)
  const [nextFireAt, setNextFireAt] = useState<number | null>(null)

  // Mutable mirrors so timer/channel callbacks always see the latest values.
  const stateRef = useRef(state)
  stateRef.current = state
  const recordActionRef = useRef(recordAction)
  recordActionRef.current = recordAction
  const trimRef = useRef(trim)
  trimRef.current = trim
  const swRef = useRef(swRegistration ?? null)
  swRef.current = swRegistration ?? null
  const onNoticeRef = useRef(onNotice)
  onNoticeRef.current = onNotice

  const runningRef = useRef(false)
  const currentRef = useRef<CurrentReminder | null>(null)
  const lastIdRef = useRef<string | undefined>(undefined)
  const tickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextTickAtRef = useRef<number | null>(null)
  const snoozeTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const snoozeFireAtsRef = useRef(new Map<string, { exerciseId: string; fireAt: number }>())
  const channelRef = useRef<EngineChannel | null>(null)

  const setCurrent = useCallback((c: CurrentReminder | null) => {
    currentRef.current = c
    setCurrentState(c)
  }, [])

  // Recompute the earliest scheduled fire time (interval tick or an armed
  // snooze), publish it to render state, and — only on the leader — broadcast it
  // so follower tabs mirror it.
  const publishSchedule = useCallback(() => {
    let value = nextTickAtRef.current
    for (const { fireAt } of snoozeFireAtsRef.current.values()) {
      if (value == null || fireAt < value) value = fireAt
    }
    setNextFireAt(value)
    if (channelRef.current?.isLeader()) channelRef.current.broadcastSchedule(value)
  }, [])

  const clearTick = useCallback(() => {
    if (tickTimerRef.current !== null) {
      clearTimeout(tickTimerRef.current)
      tickTimerRef.current = null
    }
    nextTickAtRef.current = null
  }, [])

  const clearSnoozeTimers = useCallback(() => {
    for (const timer of snoozeTimersRef.current.values()) clearTimeout(timer)
    snoozeTimersRef.current.clear()
    snoozeFireAtsRef.current.clear()
    publishSchedule()
  }, [publishSchedule])

  const fire = useCallback((exercise: Exercise, occurrenceId: string) => {
    lastIdRef.current = exercise.id
    setCurrent({ exercise, occurrenceId })
    playDing()
    void fireReminder(swRef.current, exercise, occurrenceId)
  }, [setCurrent])

  // Arm (or re-arm) a snooze timer keyed by the triggering occurrenceId. The
  // re-fire uses a fresh occurrenceId so it is distinct from the original.
  const armSnooze = useCallback((key: string, exerciseId: string, fireAt: number) => {
    const timers = snoozeTimersRef.current
    const existing = timers.get(key)
    if (existing) clearTimeout(existing)
    const occurrenceId = newId()
    snoozeFireAtsRef.current.set(key, { exerciseId, fireAt })
    const timer = setTimeout(() => {
      timers.delete(key)
      snoozeFireAtsRef.current.delete(key)
      if (!runningRef.current || !channelRef.current?.isLeader()) {
        publishSchedule()
        return
      }
      const exercise = stateRef.current.exercises.find((e) => e.id === exerciseId)
      if (!exercise || exercise.deleted) {
        publishSchedule()
        return
      }
      fire(exercise, occurrenceId)
      publishSchedule()
    }, clampDelay(fireAt - Date.now()))
    timers.set(key, timer)
    publishSchedule()
  }, [fire, publishSchedule])

  // Apply a state transition. LEADER-ONLY caller. Only touches `current` when the
  // occurrenceId matches the active reminder (a stale action never dismisses an
  // unrelated one). History recording happens in handleAction, not here.
  const applyTransition = useCallback((payload: ActionPayload) => {
    const { action, occurrenceId, exerciseId } = payload
    const matchesCurrent = currentRef.current?.occurrenceId === occurrenceId
    switch (action) {
      case 'done':
      case 'skip':
        if (matchesCurrent) setCurrent(null)
        break
      case 'shuffle': {
        if (!matchesCurrent) break
        const exercise = selectNext(eligiblePool(stateRef.current), lastIdRef.current)
        if (!exercise) {
          setCurrent(null)
          break
        }
        fire(exercise, newId())
        break
      }
      case 'snooze': {
        const fireAt = Date.now() + stateRef.current.settings.snoozeMinutes * 60_000
        armSnooze(occurrenceId, exerciseId, fireAt)
        channelRef.current?.broadcastSnooze({ key: occurrenceId, exerciseId, fireAt })
        if (matchesCurrent) setCurrent(null)
        break
      }
    }
  }, [armSnooze, fire, setCurrent])

  const scheduleTick = useCallback(() => {
    clearTick()
    const delay = clampDelay(stateRef.current.settings.intervalMinutes * 60_000)
    nextTickAtRef.current = Date.now() + delay
    tickTimerRef.current = setTimeout(() => {
      tickTimerRef.current = null
      if (!runningRef.current || !channelRef.current?.isLeader()) return
      const pool = eligiblePool(stateRef.current)
      if (pool.length === 0) {
        // No ding, no notification — but keep the loop alive so a loadout switch
        // resumes reminders automatically.
        onNoticeRef.current?.(EMPTY_POOL_NOTICE)
        scheduleTick()
        return
      }
      const exercise = selectNext(pool, lastIdRef.current)
      if (exercise) fire(exercise, newId())
      trimRef.current()
      scheduleTick()
    }, delay)
    publishSchedule()
  }, [clearTick, fire, publishSchedule])

  // Records the action in ANY tab, then either applies the transition (leader) or
  // relays it to the leader (non-leader does nothing else).
  const handleAction = useCallback(
    (payload: ActionPayload) => {
      const { action, occurrenceId, exerciseId } = payload
      if (action === 'done' || action === 'skip' || action === 'snooze') {
        recordActionRef.current(occurrenceId, exerciseId, action)
      }
      if (channelRef.current?.isLeader()) {
        applyTransition(payload)
      } else {
        channelRef.current?.relayAction({ action, occurrenceId, exerciseId })
      }
    },
    [applyTransition],
  )
  const handleActionRef = useRef(handleAction)
  handleActionRef.current = handleAction

  const start = useCallback(async () => {
    await requestPermission()
    runningRef.current = true
    setRunning(true)
    if (channelRef.current?.isLeader()) scheduleTick()
  }, [scheduleTick])

  const stop = useCallback(() => {
    runningRef.current = false
    setRunning(false)
    clearTick()
    clearSnoozeTimers()
    setCurrent(null)
    publishSchedule()
  }, [clearTick, clearSnoozeTimers, setCurrent, publishSchedule])

  // Cross-tab coordination. Handlers relay to the stable refs so leadership
  // changes resume/pause the loop without re-subscribing.
  useEffect(() => {
    const channel = createEngineChannel({
      onBecomeLeader: () => {
        if (runningRef.current) scheduleTick()
        publishSchedule()
      },
      onLoseLeader: () => {
        clearTick()
        clearSnoozeTimers()
      },
      onAction: (msg: ActionMsg) =>
        applyTransition({
          action: msg.action as ReminderAction,
          occurrenceId: msg.occurrenceId,
          exerciseId: msg.exerciseId,
        }),
      onAdoptSnooze: (msg: SnoozeMsg) => {
        const exercise = stateRef.current.exercises.find((e) => e.id === msg.exerciseId)
        if (!exercise || exercise.deleted) return
        armSnooze(msg.key, msg.exerciseId, msg.fireAt)
      },
      // Followers mirror the leader's authoritative value; the leader ignores
      // inbound schedule messages (its local computation wins).
      onSchedule: (msg: ScheduleMsg) => {
        if (!channelRef.current?.isLeader()) setNextFireAt(msg.nextFireAt)
      },
    })
    channelRef.current = channel
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [applyTransition, armSnooze, clearSnoozeTimers, clearTick, publishSchedule, scheduleTick])

  // Drain SW-queued notification actions. The SW replays them as 'reminder-action'
  // messages after main.tsx posts 'client-ready'.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const sw = navigator.serviceWorker
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } & Partial<ActionPayload>
      if (!data || data.type !== 'reminder-action') return
      if (!data.action || !data.occurrenceId || !data.exerciseId) return
      handleActionRef.current({
        action: data.action,
        occurrenceId: data.occurrenceId,
        exerciseId: data.exerciseId,
      })
    }
    sw.addEventListener('message', onMessage)
    return () => sw.removeEventListener('message', onMessage)
  }, [])

  // Soft-delete disarm: dismiss the on-screen reminder if its exercise is now
  // missing/deleted, and drop any armed snooze (timer + fireAt) for a
  // missing/deleted exercise so no phantom fire time lingers.
  useEffect(() => {
    const byId = new Map(state.exercises.map((e) => [e.id, e]))
    const cur = currentRef.current
    if (cur) {
      const ex = byId.get(cur.exercise.id)
      if (!ex || ex.deleted) setCurrent(null)
    }
    let changed = false
    for (const [key, meta] of snoozeFireAtsRef.current) {
      const ex = byId.get(meta.exerciseId)
      if (!ex || ex.deleted) {
        const t = snoozeTimersRef.current.get(key)
        if (t) {
          clearTimeout(t)
          snoozeTimersRef.current.delete(key)
        }
        snoozeFireAtsRef.current.delete(key)
        changed = true
      }
    }
    if (changed) publishSchedule()
  }, [state.exercises, setCurrent, publishSchedule])

  // Final safety net: clear any outstanding timers on unmount.
  useEffect(() => () => {
    clearTick()
    clearSnoozeTimers()
  }, [clearTick, clearSnoozeTimers])

  return { running, current, nextFireAt, start, stop, handleAction }
}
