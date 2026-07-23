import { afterEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, loadState, mergeState, saveState, serialize } from './storage'
import { createDefaultState } from './catalog'
import type { Exercise, MoveState } from './types'

function baseState(): MoveState {
  const s = createDefaultState()
  s.rollup.trimmedThroughAt = 1000
  return s
}

function customExercise(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-custom',
    name: 'Jumping jacks',
    instructions: 'Jump.',
    target: { kind: 'reps', reps: 10 },
    image: 'data:image/png;base64,AAAA',
    tags: ['home', 'cardio'],
    custom: true,
    updatedAt: 100,
    ...over,
  }
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('loadState', () => {
  it('returns defaults on empty storage', () => {
    expect(serialize(loadState())).toBe(serialize(createDefaultState()))
  })

  it('returns defaults on unparseable storage', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(serialize(loadState())).toBe(serialize(createDefaultState()))
  })

  it('drops invalid entries but keeps valid ones and re-merges built-ins', () => {
    const good = customExercise()
    const stored = {
      ...createDefaultState(),
      exercises: [good, { id: 'bad', name: 42 }, { nope: true }],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    const loaded = loadState()
    expect(loaded.exercises.find((e) => e.id === 'ex-custom')).toBeTruthy()
    // Built-ins survive the re-merge.
    expect(loaded.exercises.find((e) => e.id === 'ex-neck-rolls')).toBeTruthy()
    // Invalid entries were dropped.
    expect(loaded.exercises.find((e) => e.id === 'bad')).toBeUndefined()
  })

  it('keeps a soft-deleted built-in deleted after the defaults re-merge', () => {
    const defaults = createDefaultState()
    const builtIn = defaults.exercises.find((e) => e.id === 'ex-neck-rolls')
    if (!builtIn) throw new Error('fixture missing ex-neck-rolls')
    const stored = {
      ...defaults,
      exercises: [{ ...builtIn, deleted: true, updatedAt: 100 }],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    const loaded = loadState()
    const found = loaded.exercises.find((e) => e.id === 'ex-neck-rolls')
    expect(found?.deleted).toBe(true)
  })

  it('accepts exercises with deleted true or absent, rejects a non-boolean deleted', () => {
    const withDeletedTrue = customExercise({ id: 'ex-a', deleted: true })
    const withDeletedAbsent = customExercise({ id: 'ex-b' })
    const withBadDeleted = { ...customExercise({ id: 'ex-c' }), deleted: 'yes' }
    const stored = {
      ...createDefaultState(),
      exercises: [withDeletedTrue, withDeletedAbsent, withBadDeleted],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    const loaded = loadState()
    expect(loaded.exercises.find((e) => e.id === 'ex-a')?.deleted).toBe(true)
    expect(loaded.exercises.find((e) => e.id === 'ex-b')).toBeTruthy()
    expect(loaded.exercises.find((e) => e.id === 'ex-c')).toBeUndefined()
  })
})

describe('mergeState', () => {
  it('is commutative and idempotent', () => {
    const a = { ...baseState(), exercises: [...baseState().exercises, customExercise()] }
    const b = {
      ...baseState(),
      exercises: [...baseState().exercises, customExercise({ name: 'Renamed', updatedAt: 200 })],
    }
    expect(serialize(mergeState(a, b))).toBe(serialize(mergeState(b, a)))
    expect(serialize(mergeState(a, a))).toBe(serialize(a))
    // Repeated merging is stable (no ping-pong).
    const once = mergeState(a, b)
    const twice = mergeState(once, mergeState(b, a))
    expect(serialize(twice)).toBe(serialize(once))
  })

  it('resolves divergent same-id exercises by greater updatedAt', () => {
    const older = customExercise({ name: 'Old', updatedAt: 100 })
    const newer = customExercise({ name: 'New', updatedAt: 300 })
    const a = { ...baseState(), exercises: [older] }
    const b = { ...baseState(), exercises: [newer] }
    const merged = mergeState(a, b)
    expect(merged.exercises.find((e) => e.id === 'ex-custom')?.name).toBe('New')
  })

  it('breaks updatedAt ties by lexicographic serialization (deterministic)', () => {
    const x = customExercise({ name: 'Alpha', updatedAt: 100 })
    const y = customExercise({ name: 'Beta', updatedAt: 100 })
    const a = { ...baseState(), exercises: [x] }
    const b = { ...baseState(), exercises: [y] }
    expect(serialize(mergeState(a, b))).toBe(serialize(mergeState(b, a)))
  })

  it('resolves divergent settings by greater updatedAt', () => {
    const a = baseState()
    a.settings = { ...a.settings, intervalMinutes: 15, updatedAt: 500 }
    const b = baseState()
    b.settings = { ...b.settings, intervalMinutes: 45, updatedAt: 100 }
    expect(mergeState(a, b).settings.intervalMinutes).toBe(15)
  })

  it('drops history entries at or below the merged trimmedThroughAt', () => {
    const a = baseState()
    a.history = [
      { id: 'h1', occurrenceId: 'o1', exerciseId: 'ex-custom', action: 'done', at: 500 },
      { id: 'h2', occurrenceId: 'o2', exerciseId: 'ex-custom', action: 'done', at: 1500 },
    ]
    const b = baseState()
    const merged = mergeState(a, b)
    expect(merged.history.map((e) => e.id)).toEqual(['h2'])
  })

  it('unions a creation present only in a stale tab', () => {
    const a = { ...baseState(), exercises: [...baseState().exercises, customExercise()] }
    const b = baseState()
    b.settings = { ...b.settings, updatedAt: 9999 }
    const merged = mergeState(a, b)
    expect(merged.exercises.find((e) => e.id === 'ex-custom')).toBeTruthy()
  })

  it('a deleted exercise with a newer updatedAt wins over a non-deleted older copy', () => {
    const older = customExercise({ updatedAt: 100 })
    const newer = customExercise({ deleted: true, updatedAt: 300 })
    const a = { ...baseState(), exercises: [older] }
    const b = { ...baseState(), exercises: [newer] }
    const merged = mergeState(a, b)
    expect(merged.exercises.find((e) => e.id === 'ex-custom')?.deleted).toBe(true)
  })

  it('a non-deleted exercise with a newer updatedAt wins over a deleted older copy', () => {
    const older = customExercise({ deleted: true, updatedAt: 100 })
    const newer = customExercise({ updatedAt: 300 })
    const a = { ...baseState(), exercises: [older] }
    const b = { ...baseState(), exercises: [newer] }
    const merged = mergeState(a, b)
    expect(merged.exercises.find((e) => e.id === 'ex-custom')?.deleted).toBeUndefined()
  })

  it('keeps the greater trimmedThroughAt rollup', () => {
    const a = baseState()
    a.rollup = { done: 3, ignored: 1, doneDayKeys: ['2026-06-01'], trimmedThroughAt: 5000 }
    const b = baseState()
    b.rollup = { done: 1, ignored: 0, doneDayKeys: ['2026-05-01'], trimmedThroughAt: 2000 }
    expect(mergeState(a, b).rollup.trimmedThroughAt).toBe(5000)
    expect(mergeState(a, b).rollup.done).toBe(3)
  })
})

describe('saveState', () => {
  it('writes once then skips an identical re-save', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    const s = baseState()
    s.settings = { ...s.settings, updatedAt: 424242 }
    saveState(s)
    saveState(s)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
