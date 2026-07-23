import { describe, expect, it } from 'vitest'
import {
  SITTING_BREAKS_SOURCE,
  dedupeHistory,
  deriveStats,
  estActiveMinutes,
  trimHistory,
} from './progress'
import { HISTORY_CAP, createDefaultState, localDayKey } from './catalog'
import type { HistoryEntry, MoveState, Rollup } from './types'

const emptyRollup: Rollup = { done: 0, ignored: 0, doneDayKeys: [], trimmedThroughAt: 0 }

describe('dedupeHistory', () => {
  it('collapses entries sharing (occurrenceId, action), keeping earliest', () => {
    const out = dedupeHistory([
      { id: 'a', occurrenceId: 'o1', exerciseId: 'ex-a', action: 'done', at: 5000 },
      { id: 'b', occurrenceId: 'o1', exerciseId: 'ex-a', action: 'done', at: 2000 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].at).toBe(2000)
  })

  it('collapses distinct-occurrence same-(exerciseId, action) within the window', () => {
    const out = dedupeHistory([
      { id: 'a', occurrenceId: 'o1', exerciseId: 'ex-a', action: 'done', at: 1000 },
      { id: 'b', occurrenceId: 'o2', exerciseId: 'ex-a', action: 'done', at: 1000 + 5000 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].at).toBe(1000)
  })

  it('does NOT collapse distinct occurrences outside the window', () => {
    const out = dedupeHistory([
      { id: 'a', occurrenceId: 'o1', exerciseId: 'ex-a', action: 'done', at: 1000 },
      { id: 'b', occurrenceId: 'o2', exerciseId: 'ex-a', action: 'done', at: 1000 + 20000 },
    ])
    expect(out).toHaveLength(2)
  })

  it('is order-independent', () => {
    const a: HistoryEntry[] = [
      { id: 'a', occurrenceId: 'o1', exerciseId: 'ex-a', action: 'done', at: 1000 },
      { id: 'b', occurrenceId: 'o2', exerciseId: 'ex-a', action: 'done', at: 3000 },
    ]
    expect(dedupeHistory(a)).toEqual(dedupeHistory([...a].reverse()))
  })
})

describe('deriveStats', () => {
  it('counts done/ignored and excludes snooze/shuffle', () => {
    const history: HistoryEntry[] = [
      { id: 'a', occurrenceId: 'o1', exerciseId: 'ex-a', action: 'done', at: 1000 },
      { id: 'b', occurrenceId: 'o2', exerciseId: 'ex-b', action: 'skip', at: 2000 },
      { id: 'c', occurrenceId: 'o3', exerciseId: 'ex-c', action: 'snooze', at: 3000 },
      { id: 'd', occurrenceId: 'o4', exerciseId: 'ex-d', action: 'shuffle', at: 4000 },
    ]
    const stats = deriveStats(emptyRollup, history, 5000)
    expect(stats.done).toBe(1)
    expect(stats.ignored).toBe(1)
  })

  it('adds rollup totals and excludes trimmed entries', () => {
    const rollup: Rollup = { done: 10, ignored: 4, doneDayKeys: [], trimmedThroughAt: 1500 }
    const history: HistoryEntry[] = [
      { id: 'a', occurrenceId: 'o1', exerciseId: 'ex-a', action: 'done', at: 1000 },
      { id: 'b', occurrenceId: 'o2', exerciseId: 'ex-b', action: 'done', at: 2000 },
    ]
    const stats = deriveStats(rollup, history, 3000)
    expect(stats.done).toBe(11)
  })

  it('computes a DST-stable streak from fixed local timestamps', () => {
    const d13 = new Date(2026, 2, 13, 12).getTime()
    const d14 = new Date(2026, 2, 14, 12).getTime()
    const d15 = new Date(2026, 2, 15, 12).getTime()
    const now = new Date(2026, 2, 15, 20).getTime()
    const history: HistoryEntry[] = [
      { id: 'a', occurrenceId: 'o1', exerciseId: 'ex-a', action: 'done', at: d13 },
      { id: 'b', occurrenceId: 'o2', exerciseId: 'ex-b', action: 'done', at: d14 },
      { id: 'c', occurrenceId: 'o3', exerciseId: 'ex-c', action: 'done', at: d15 },
    ]
    expect(deriveStats(emptyRollup, history, now).streak).toBe(3)
  })

  it('reports a zero streak when today has no done entry', () => {
    const d13 = new Date(2026, 2, 13, 12).getTime()
    const now = new Date(2026, 2, 15, 12).getTime()
    const history: HistoryEntry[] = [
      { id: 'a', occurrenceId: 'o1', exerciseId: 'ex-a', action: 'done', at: d13 },
    ]
    expect(deriveStats(emptyRollup, history, now).streak).toBe(0)
  })

  it('attributes the factual figure and leaves estActiveMinutes unattributed', () => {
    const history: HistoryEntry[] = [
      { id: 'a', occurrenceId: 'o1', exerciseId: 'ex-a', action: 'done', at: 1000 },
    ]
    const stats = deriveStats(emptyRollup, history, 2000)
    expect(stats.source).toBe(SITTING_BREAKS_SOURCE)
    expect(stats.sittingBreaks).toBe(stats.done)
    expect(stats.estActiveMinutes).toBe(estActiveMinutes(stats.done))
    expect(stats.estActiveMinutes).toBe(2)
  })
})

describe('trimHistory', () => {
  it('returns the state unchanged at or under the cap', () => {
    const state = createDefaultState()
    state.history = [{ id: 'a', occurrenceId: 'o1', exerciseId: 'ex-a', action: 'done', at: 1 }]
    expect(trimHistory(state)).toBe(state)
  })

  it('folds dropped totals into the rollup and bounds doneDayKeys to the streak span', () => {
    const old1 = new Date(2026, 0, 1, 12).getTime()
    const old2 = new Date(2026, 0, 2, 12).getTime()
    const fillerStart = new Date(2026, 5, 1, 12).getTime()
    const fillers: HistoryEntry[] = Array.from({ length: HISTORY_CAP }, (_, i) => ({
      id: `f-${i}`,
      occurrenceId: `of-${i}`,
      exerciseId: 'ex-fill',
      action: 'snooze',
      at: fillerStart + i * 20000,
    }))
    const state: MoveState = {
      ...createDefaultState(),
      history: [
        { id: 'old1', occurrenceId: 'oa', exerciseId: 'ex-a', action: 'done', at: old1 },
        { id: 'old2', occurrenceId: 'ob', exerciseId: 'ex-b', action: 'done', at: old2 },
        ...fillers,
      ],
      rollup: { done: 0, ignored: 0, doneDayKeys: ['2025-01-01'], trimmedThroughAt: 0 },
    }

    const trimmed = trimHistory(state)
    expect(trimmed.history).toHaveLength(HISTORY_CAP)
    expect(trimmed.rollup.done).toBe(2)
    expect(trimmed.rollup.trimmedThroughAt).toBe(old2)
    // The stale, non-contiguous day key is pruned away.
    expect(trimmed.rollup.doneDayKeys).toEqual([localDayKey(old2), localDayKey(old1)])
  })
})
