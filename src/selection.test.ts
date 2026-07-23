import { describe, expect, it } from 'vitest'
import { eligiblePool, isEligible, matchesLoadout, selectNext } from './selection'
import { createDefaultState } from './catalog'
import type { Exercise, Loadout, MoveState } from './types'

function ex(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-1',
    name: 'Test',
    instructions: '',
    target: { kind: 'reps', reps: 1 },
    image: '',
    tags: [],
    custom: true,
    updatedAt: 0,
    ...overrides,
  }
}

function loadout(overrides: Partial<Loadout> = {}): Loadout {
  return { id: 'l1', name: 'L', include: [], requireAll: [], exclude: [], updatedAt: 0, ...overrides }
}

describe('matchesLoadout', () => {
  it('passes when include is empty', () => {
    expect(matchesLoadout(ex({ tags: ['strength'] }), loadout())).toBe(true)
  })

  it('requires at least one include tag when include is non-empty', () => {
    const l = loadout({ include: ['cardio'] })
    expect(matchesLoadout(ex({ tags: ['strength'] }), l)).toBe(false)
    expect(matchesLoadout(ex({ tags: ['Cardio'] }), l)).toBe(true)
  })

  it('enforces requireAll', () => {
    const l = loadout({ requireAll: ['a', 'b'] })
    expect(matchesLoadout(ex({ tags: ['a'] }), l)).toBe(false)
    expect(matchesLoadout(ex({ tags: ['a', 'b'] }), l)).toBe(true)
  })

  it('removes exercises carrying an exclude tag', () => {
    const l = loadout({ exclude: ['jumping'] })
    expect(matchesLoadout(ex({ tags: ['jumping'] }), l)).toBe(false)
    expect(matchesLoadout(ex({ tags: ['calm'] }), l)).toBe(true)
  })
})

function stateWith(overrides: Partial<MoveState['settings']>, tags = createDefaultState().tags): MoveState {
  const base = createDefaultState()
  return { ...base, tags, settings: { ...base.settings, ...overrides } }
}

describe('isEligible', () => {
  it('excludes an exercise needing unowned equipment', () => {
    const tags = [...createDefaultState().tags, { name: 'dumbbell', axis: 'equipment' as const, updatedAt: 0 }]
    const state = stateWith({ ownedEquipment: [] }, tags)
    expect(isEligible(ex({ tags: ['dumbbell'] }), state, loadout())).toBe(false)
    const owned = stateWith({ ownedEquipment: ['dumbbell'] }, tags)
    expect(isEligible(ex({ tags: ['dumbbell'] }), owned, loadout())).toBe(true)
  })

  it('excludes on context non-match but passes context-agnostic exercises', () => {
    const state = stateWith({ activeContext: 'office' })
    expect(isEligible(ex({ tags: ['home'] }), state, loadout())).toBe(false)
    expect(isEligible(ex({ tags: ['office'] }), state, loadout())).toBe(true)
    expect(isEligible(ex({ tags: [] }), state, loadout())).toBe(true)
  })

  it('applies no context constraint when activeContext is dangling', () => {
    const state = stateWith({ activeContext: 'nowhere' })
    expect(isEligible(ex({ tags: ['home'] }), state, loadout())).toBe(true)
  })
})

describe('eligiblePool', () => {
  it('returns a non-empty pool and does not crash when activeLoadoutId is dangling', () => {
    const state = createDefaultState()
    state.settings.activeLoadoutId = 'gone'
    const pool = eligiblePool(state)
    expect(pool.length).toBeGreaterThan(0)
  })

  it('excludes exactly the exercise marked deleted while keeping the rest', () => {
    const state = createDefaultState()
    const before = eligiblePool(state)
    expect(before.length).toBeGreaterThan(1)
    const target = before[0]
    target.deleted = true
    const after = eligiblePool(state)
    expect(after.some((e) => e.id === target.id)).toBe(false)
    expect(after.length).toBe(before.length - 1)
  })

  it('drops a deleted exercise that would otherwise be eligible', () => {
    const state = createDefaultState()
    const deletedEx = ex({ id: 'deleted-1', deleted: true })
    state.exercises = [...state.exercises, deletedEx]
    const pool = eligiblePool(state)
    expect(pool.some((e) => e.id === 'deleted-1')).toBe(false)
  })
})

describe('selectNext', () => {
  it('returns null on an empty pool', () => {
    expect(selectNext([])).toBeNull()
  })

  it('returns the sole item when the pool has one', () => {
    const only = ex({ id: 'only' })
    expect(selectNext([only])).toBe(only)
  })

  it('avoids lastId when the pool has more than one item', () => {
    const a = ex({ id: 'a' })
    const b = ex({ id: 'b' })
    const pool = [a, b]
    for (let i = 0; i < 50; i++) expect(selectNext(pool, 'a')?.id).toBe('b')
  })
})
