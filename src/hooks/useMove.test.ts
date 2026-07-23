import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Wrap saveState so we can assert on persistence while keeping every other
// storage helper (serialize, loadState, mergeState) real.
vi.mock('../storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storage')>()
  return { ...actual, saveState: vi.fn(actual.saveState) }
})

import { STORAGE_KEY, loadState, saveState } from '../storage'
import { createDefaultState } from '../catalog'
import { useMove } from './useMove'

const saveStateMock = vi.mocked(saveState)

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('useMove', () => {
  it('does not re-save when an incoming storage event is equal-but-reordered', () => {
    const { result } = renderHook(() => useMove())
    expect(saveStateMock).not.toHaveBeenCalled() // no save on mount

    // Same content as the default state, only with arrays in a different order.
    const d = createDefaultState()
    const reordered = {
      ...d,
      exercises: [...d.exercises].reverse(),
      tags: [...d.tags].reverse(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reordered))

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
    })

    // Merged serialized form is identical → no state change, no save.
    expect(saveStateMock).not.toHaveBeenCalled()
    expect(result.current.state.settings.activeContext).toBe('office')
  })

  it('stamps updatedAt and persists exactly once on a real mutation', () => {
    const { result } = renderHook(() => useMove())
    expect(result.current.state.settings.updatedAt).toBe(0)

    act(() => {
      result.current.setContext('home')
    })

    expect(result.current.state.settings.activeContext).toBe('home')
    expect(result.current.state.settings.updatedAt).toBeGreaterThan(0)
    expect(saveStateMock).toHaveBeenCalledTimes(1)
  })

  it('appends a stamped history entry on recordAction', () => {
    const { result } = renderHook(() => useMove())

    act(() => {
      result.current.recordAction('occ-1', 'ex-neck-rolls', 'done')
    })

    const entries = result.current.state.history
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      occurrenceId: 'occ-1',
      exerciseId: 'ex-neck-rolls',
      action: 'done',
    })
    expect(entries[0].id).toBeTruthy()
    expect(entries[0].at).toBeGreaterThan(0)
  })

  it('updateExercise applies draft fields, bumps updatedAt, and clears a tombstone', () => {
    const { result } = renderHook(() => useMove())
    const before = result.current.state.exercises.find((e) => e.id === 'ex-neck-rolls')!
    expect(before.updatedAt).toBe(0)

    act(() => {
      result.current.deleteExercise('ex-neck-rolls')
    })
    expect(result.current.state.exercises.find((e) => e.id === 'ex-neck-rolls')?.deleted).toBe(true)

    act(() => {
      result.current.updateExercise('ex-neck-rolls', { ...before, name: 'Neck Rolls (updated)' })
    })

    const after = result.current.state.exercises.find((e) => e.id === 'ex-neck-rolls')!
    expect(after.name).toBe('Neck Rolls (updated)')
    expect(after.deleted).toBe(false)
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt)
  })

  it('deleteExercise sets deleted: true and bumps updatedAt, persisting across reload', () => {
    const { result } = renderHook(() => useMove())
    const before = result.current.state.exercises.find((e) => e.id === 'ex-shoulder-shrugs')!

    act(() => {
      result.current.deleteExercise('ex-shoulder-shrugs')
    })

    const after = result.current.state.exercises.find((e) => e.id === 'ex-shoulder-shrugs')!
    expect(after.deleted).toBe(true)
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt)

    const reloaded = loadState()
    expect(reloaded.exercises.find((e) => e.id === 'ex-shoulder-shrugs')?.deleted).toBe(true)
  })
})
