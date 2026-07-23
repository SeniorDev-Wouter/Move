import type { HistoryEntry, MoveState, ReminderAction, Rollup } from './types'
import { DEDUPE_WINDOW_MS, HISTORY_CAP, localDayKey, pruneDoneDayKeys } from './catalog'

export const SITTING_BREAKS_SOURCE = 'Diaz et al., Annals of Internal Medicine, 2017'

/** Deterministic tiebreak: earliest `at`, then smallest id. */
function keepEarlier(a: HistoryEntry, b: HistoryEntry): HistoryEntry {
  if (a.at !== b.at) return a.at < b.at ? a : b
  return a.id <= b.id ? a : b
}

function byAtThenId(a: HistoryEntry, b: HistoryEntry): number {
  if (a.at !== b.at) return a.at - b.at
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Canonical history dedupe:
 *  1. Collapse entries sharing (occurrenceId, action) to one, keeping earliest.
 *  2. Collapse entries sharing (exerciseId, action) whose `at` fall within
 *     DEDUPE_WINDOW_MS of a cluster anchor, keeping earliest.
 * Fully deterministic regardless of input order. The pipe delimiter is safe:
 * ids (UUID/hyphen/base36) and the action enum never contain a pipe.
 */
export function dedupeHistory(entries: HistoryEntry[]): HistoryEntry[] {
  // Pass 1: dedupe by (occurrenceId, action).
  const byOccurrence = new Map<string, HistoryEntry>()
  for (const e of entries) {
    const key = [e.occurrenceId, e.action].join('|')
    const existing = byOccurrence.get(key)
    byOccurrence.set(key, existing ? keepEarlier(existing, e) : e)
  }

  // Pass 2: within each (exerciseId, action), collapse near-in-time clusters.
  const byExercise = new Map<string, HistoryEntry[]>()
  for (const e of byOccurrence.values()) {
    const key = [e.exerciseId, e.action].join('|')
    const group = byExercise.get(key)
    if (group) group.push(e)
    else byExercise.set(key, [e])
  }

  const result: HistoryEntry[] = []
  for (const group of byExercise.values()) {
    const sorted = [...group].sort(byAtThenId)
    let anchor: HistoryEntry | null = null
    for (const e of sorted) {
      if (anchor === null || e.at - anchor.at > DEDUPE_WINDOW_MS) {
        anchor = e
        result.push(e)
      }
      // else: within the window of the current anchor, collapse into it.
    }
  }

  return result.sort(byAtThenId)
}

export function estActiveMinutes(doneCount: number): number {
  return doneCount * 2
}

export function deriveStats(
  rollup: Rollup,
  history: HistoryEntry[],
  now?: number,
): {
  done: number
  ignored: number
  streak: number
  sittingBreaks: number
  estActiveMinutes: number
  source: string
} {
  const retained = dedupeHistory(history.filter((e) => e.at > rollup.trimmedThroughAt))
  const doneEntries = retained.filter((e) => e.action === 'done')
  const done = rollup.done + doneEntries.length
  const ignored = rollup.ignored + retained.filter((e) => e.action === 'skip').length

  const dayKeys = new Set<string>(rollup.doneDayKeys)
  for (const e of doneEntries) dayKeys.add(localDayKey(e.at))

  const streak = countStreak(dayKeys, now ?? Date.now())

  return {
    done,
    ignored,
    streak,
    sittingBreaks: done,
    estActiveMinutes: estActiveMinutes(done),
    source: SITTING_BREAKS_SOURCE,
  }
}

export function deriveActivity(
  rollup: Rollup,
  history: HistoryEntry[],
  _now?: number,
  cap = 50,
): {
  perExercise: { exerciseId: string; count: number }[]
  log: { exerciseId: string; action: ReminderAction; at: number }[]
} {
  const retained = dedupeHistory(history.filter((e) => e.at > rollup.trimmedThroughAt))
  const counts = new Map<string, number>()
  for (const e of retained) {
    if (e.action === 'done') counts.set(e.exerciseId, (counts.get(e.exerciseId) ?? 0) + 1)
  }
  const perExercise = Array.from(counts, ([exerciseId, count]) => ({ exerciseId, count }))
  const log = retained
    .filter((e) => e.action === 'done' || e.action === 'skip')
    .sort((a, b) => b.at - a.at)
    .slice(0, cap)
    .map((e) => ({ exerciseId: e.exerciseId, action: e.action, at: e.at }))
  return { perExercise, log }
}

/** The local day key exactly one calendar day before the given key. */
function previousDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() - 1)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Consecutive local calendar days present in the set, ending at today. */
function countStreak(dayKeys: Set<string>, now: number): number {
  let cursor = localDayKey(now)
  let streak = 0
  while (dayKeys.has(cursor)) {
    streak++
    cursor = previousDayKey(cursor)
  }
  return streak
}

/**
 * LEADER-ONLY history trim. If at/under the cap, return the state unchanged.
 * Otherwise fold the oldest overflow entries into the rollup and keep the
 * most-recent HISTORY_CAP entries.
 */
export function trimHistory(state: MoveState): MoveState {
  if (state.history.length <= HISTORY_CAP) return state

  const sorted = [...state.history].sort(byAtThenId)
  const dropCount = sorted.length - HISTORY_CAP
  const dropped = sorted.slice(0, dropCount)
  const kept = sorted.slice(dropCount)

  const deduped = dedupeHistory(dropped)
  const droppedDone = deduped.filter((e) => e.action === 'done')
  const droppedSkip = deduped.filter((e) => e.action === 'skip')
  const trimmedThroughAt = Math.max(state.rollup.trimmedThroughAt, ...dropped.map((e) => e.at))

  const rollup: Rollup = {
    done: state.rollup.done + droppedDone.length,
    ignored: state.rollup.ignored + droppedSkip.length,
    doneDayKeys: pruneDoneDayKeys([
      ...state.rollup.doneDayKeys,
      ...droppedDone.map((e) => localDayKey(e.at)),
    ]),
    trimmedThroughAt,
  }

  return { ...state, history: kept, rollup }
}
