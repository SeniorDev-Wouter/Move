import { newId } from './id'

export type ReminderMsg = { type: 'reminder'; exerciseId: string; occurrenceId: string }
export type ActionMsg = {
  type: 'action'
  action: string
  occurrenceId: string
  exerciseId: string
  actionEventId: string
}
export type SnoozeMsg = { type: 'snooze'; key: string; exerciseId: string; fireAt: number }
export type ScheduleMsg = { type: 'schedule'; nextFireAt: number | null }

export type EngineHandlers = {
  onBecomeLeader?: () => void
  onLoseLeader?: () => void
  onAction?: (msg: ActionMsg) => void // leader applies relayed actions
  onAdoptSnooze?: (msg: SnoozeMsg) => void // new leader adopts a still-future snooze
  onSchedule?: (msg: ScheduleMsg) => void // followers mirror the leader's next fire time
}

export type EngineChannel = {
  isLeader: () => boolean
  relayAction: (a: Omit<ActionMsg, 'type' | 'actionEventId'>) => void
  broadcastSnooze: (s: Omit<SnoozeMsg, 'type'>) => void
  broadcastSchedule: (nextFireAt: number | null) => void
  close: () => void
}

/** Internal election/coordination messages, never surfaced to consumers. */
type CandidacyMsg = { type: 'candidacy'; priority: string }
type HeartbeatMsg = { type: 'heartbeat'; priority: string }
type ResignMsg = { type: 'resign'; priority: string }
type AckMsg = { type: 'ack'; actionEventId: string }

type EngineMsg =
  | ReminderMsg
  | ActionMsg
  | SnoozeMsg
  | ScheduleMsg
  | CandidacyMsg
  | HeartbeatMsg
  | ResignMsg
  | AckMsg

const CHANNEL_NAME = 'move.engine'
const HEARTBEAT_MS = 2000
const FAILOVER_MS = 6000
const ELECTION_MS = 500
const RETRY_MS = 1000
const PROCESSED_TTL_MS = 30_000

/**
 * Coordinate a single active engine across tabs via BroadcastChannel('move.engine').
 *
 * When BroadcastChannel is unavailable (jsdom, old webviews) this returns a
 * no-op shim whose isLeader() is always true — each tab then runs its own
 * engine, so duplicate notifications are possible. This is intentional and
 * documented degradation.
 *
 * Otherwise tabs elect a leader by lowest tabPriority (a newId(), a
 * deterministic tiebreak). The leader heartbeats every 2s; a follower that
 * sees no heartbeat for 6s — or an explicit resign — re-runs the election.
 * Non-leaders relay actions to the leader and retry until acked (or until they
 * themselves become leader and apply the action locally); the leader applies
 * each actionEventId exactly once and acks. Snoozes are broadcast and adopted
 * by a newly elected leader while still in the future.
 */
export function createEngineChannel(handlers: EngineHandlers): EngineChannel {
  if (typeof BroadcastChannel === 'undefined') {
    return {
      isLeader: () => true,
      relayAction: () => {},
      broadcastSnooze: () => {},
      broadcastSchedule: () => {},
      close: () => {},
    }
  }

  const priority = newId()
  const bc = new BroadcastChannel(CHANNEL_NAME)

  let leader = false
  let closed = false
  let electing = false
  let sawLower = false

  let electionTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let failoverTimer: ReturnType<typeof setTimeout> | null = null

  const snoozes = new Map<string, SnoozeMsg>()
  let lastSchedule: ScheduleMsg | null = null
  const processed = new Set<string>()
  const pending = new Map<string, { msg: ActionMsg; timer: ReturnType<typeof setInterval> }>()

  const post = (msg: EngineMsg): void => {
    try {
      bc.postMessage(msg)
    } catch {
      // Channel closed underneath us — ignore.
    }
  }

  // Record an actionEventId as seen (leader or follower) so dedup survives a
  // leader handoff: a tab that observed an action on the wire will not re-apply
  // it after being promoted, even if the previous leader died before acking.
  const remember = (actionEventId: string): void => {
    if (processed.has(actionEventId)) return
    processed.add(actionEventId)
    setTimeout(() => processed.delete(actionEventId), PROCESSED_TTL_MS)
  }

  const applyOnce = (msg: ActionMsg): void => {
    if (processed.has(msg.actionEventId)) return
    remember(msg.actionEventId)
    handlers.onAction?.(msg)
  }

  const armFailover = (): void => {
    if (closed) return
    if (failoverTimer) clearTimeout(failoverTimer)
    failoverTimer = setTimeout(() => {
      failoverTimer = null
      startElection()
    }, FAILOVER_MS)
  }

  const stepDown = (): void => {
    if (!leader) return
    leader = false
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    handlers.onLoseLeader?.()
    armFailover()
  }

  const becomeLeader = (): void => {
    if (closed || leader) return
    leader = true
    electing = false
    if (failoverTimer) {
      clearTimeout(failoverTimer)
      failoverTimer = null
    }
    handlers.onBecomeLeader?.()
    // Adopt any still-future snooze we heard about before winning.
    const now = Date.now()
    for (const snooze of snoozes.values()) {
      if (snooze.fireAt > now) handlers.onAdoptSnooze?.(snooze)
    }
    // Any action we were relaying is now ours to apply.
    for (const [, entry] of pending) {
      clearInterval(entry.timer)
      applyOnce(entry.msg)
    }
    pending.clear()
    post({ type: 'heartbeat', priority })
    heartbeatTimer = setInterval(() => {
      post({ type: 'heartbeat', priority })
      // Re-broadcast the cached schedule so mid-interval joiners get it.
      if (lastSchedule) post(lastSchedule)
    }, HEARTBEAT_MS)
  }

  const startElection = (): void => {
    if (closed || leader) return
    electing = true
    sawLower = false
    if (electionTimer) clearTimeout(electionTimer)
    post({ type: 'candidacy', priority })
    electionTimer = setTimeout(() => {
      electionTimer = null
      electing = false
      if (!sawLower && !closed) becomeLeader()
      else armFailover()
    }, ELECTION_MS)
  }

  const onMessage = (event: MessageEvent): void => {
    if (closed) return
    const msg = event.data as EngineMsg
    switch (msg.type) {
      case 'candidacy':
        if (msg.priority < priority) {
          sawLower = true
          if (leader) stepDown()
          else armFailover()
        } else if (msg.priority > priority) {
          // I outrank the candidate — assert myself so late joiners learn of me.
          post({ type: 'candidacy', priority })
          if (!leader && !electing) startElection()
        }
        break
      case 'heartbeat':
        if (msg.priority < priority) {
          if (leader) stepDown()
          else armFailover()
        } else if (msg.priority > priority) {
          if (leader) post({ type: 'heartbeat', priority })
          else if (!electing) startElection()
        }
        break
      case 'resign':
        if (failoverTimer) {
          clearTimeout(failoverTimer)
          failoverTimer = null
        }
        if (!leader) startElection()
        break
      case 'action':
        if (leader) {
          applyOnce(msg) // records + applies once; a duplicate just re-acks
          post({ type: 'ack', actionEventId: msg.actionEventId })
        } else {
          // Followers record the id on the wire so a future leader won't re-apply it.
          remember(msg.actionEventId)
        }
        break
      case 'ack': {
        const entry = pending.get(msg.actionEventId)
        if (entry) {
          clearInterval(entry.timer)
          pending.delete(msg.actionEventId)
        }
        break
      }
      case 'snooze':
        snoozes.set(msg.key, msg)
        break
      case 'schedule':
        handlers.onSchedule?.(msg)
        break
      default:
        break
    }
  }

  const onHide = (): void => {
    if (leader && !closed) post({ type: 'resign', priority })
  }
  const onVisibility = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') onHide()
  }

  bc.addEventListener('message', onMessage)
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onHide)
    window.addEventListener('beforeunload', onHide)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
  }

  const relayAction = (a: Omit<ActionMsg, 'type' | 'actionEventId'>): void => {
    if (closed) return
    const msg: ActionMsg = { type: 'action', actionEventId: newId(), ...a }
    if (leader) {
      applyOnce(msg)
      return
    }
    post(msg)
    const timer = setInterval(() => {
      if (closed) {
        clearInterval(timer)
        pending.delete(msg.actionEventId)
        return
      }
      post(msg)
    }, RETRY_MS)
    pending.set(msg.actionEventId, { msg, timer })
  }

  const broadcastSnooze = (s: Omit<SnoozeMsg, 'type'>): void => {
    if (closed) return
    const msg: SnoozeMsg = { type: 'snooze', ...s }
    snoozes.set(msg.key, msg)
    post(msg)
  }

  const broadcastSchedule = (nextFireAt: number | null): void => {
    if (closed) return
    const msg: ScheduleMsg = { type: 'schedule', nextFireAt }
    lastSchedule = msg
    post(msg)
  }

  const close = (): void => {
    if (closed) return
    // Mark closed first so any re-entrant delivery of our own resign (a
    // successor's election candidacy bouncing back) is ignored by onMessage.
    closed = true
    const wasLeader = leader
    leader = false
    if (electionTimer) clearTimeout(electionTimer)
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    if (failoverTimer) clearTimeout(failoverTimer)
    for (const entry of pending.values()) clearInterval(entry.timer)
    pending.clear()
    if (wasLeader) post({ type: 'resign', priority })
    bc.removeEventListener('message', onMessage)
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('beforeunload', onHide)
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility)
    }
    try {
      bc.close()
    } catch {
      // Already closed — ignore.
    }
  }

  startElection()

  return { isLeader: () => leader, relayAction, broadcastSnooze, broadcastSchedule, close }
}
