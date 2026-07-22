import { describe, expect, it } from 'vitest'
import {
  PLACEHOLDER_IMAGE,
  axisOf,
  createDefaultState,
  formatTarget,
  isSafeImage,
  localDayKey,
  normalizeTag,
  pruneDoneDayKeys,
  resolveActiveLoadout,
} from './catalog'
import type { MoveState } from './types'

describe('normalizeTag', () => {
  it('trims and lowercases', () => {
    expect(normalizeTag('  Office  ')).toBe('office')
    expect(normalizeTag('MOBILITY')).toBe('mobility')
  })
})

describe('isSafeImage', () => {
  it('accepts the placeholder and raster data URLs', () => {
    expect(isSafeImage(PLACEHOLDER_IMAGE)).toBe(true)
    expect(isSafeImage('data:image/png;base64,AAAA')).toBe(true)
    expect(isSafeImage('data:image/jpeg;base64,AAAA')).toBe(true)
    expect(isSafeImage('DATA:image/webp;base64,AAAA')).toBe(true)
  })

  it('rejects non-raster and dangerous payloads', () => {
    expect(isSafeImage('data:text/html,<b>x</b>')).toBe(false)
    expect(isSafeImage('javascript:alert(1)')).toBe(false)
    expect(isSafeImage('data:image/svg+xml,<svg/>')).toBe(false)
    expect(isSafeImage('data:image/SVG,<svg/>')).toBe(false)
    expect(isSafeImage('data:image/svg,<svg/>')).toBe(false)
    expect(isSafeImage('data:,nothing')).toBe(false)
  })
})

describe('axisOf', () => {
  it('resolves seeded tags and defaults unknown to other', () => {
    const { tags } = createDefaultState()
    expect(axisOf(tags, 'office')).toBe('context')
    expect(axisOf(tags, 'Mobility')).toBe('type')
    expect(axisOf(tags, 'nonexistent')).toBe('other')
  })
})

describe('formatTarget', () => {
  it('renders reps and time forms', () => {
    expect(formatTarget({ kind: 'reps', reps: 12 })).toBe('12 reps')
    expect(formatTarget({ kind: 'time', seconds: 30 })).toBe('30s')
  })
})

describe('localDayKey', () => {
  it('is stable for the same local day', () => {
    const morning = new Date(2026, 5, 15, 8, 30).getTime()
    const evening = new Date(2026, 5, 15, 22, 45).getTime()
    expect(localDayKey(morning)).toBe(localDayKey(evening))
    expect(localDayKey(morning)).toBe('2026-06-15')
  })
})

describe('resolveActiveLoadout', () => {
  it('returns the active loadout', () => {
    const state = createDefaultState()
    expect(resolveActiveLoadout(state).id).toBe('loadout-office-safe')
  })

  it('falls back to Office-safe when the active id is dangling', () => {
    const state = createDefaultState()
    state.settings.activeLoadoutId = 'does-not-exist'
    expect(resolveActiveLoadout(state).name).toBe('Office-safe')
  })
})

describe('pruneDoneDayKeys', () => {
  it('keeps the contiguous most-recent run and drops keys before a gap', () => {
    const keys = ['2026-06-15', '2026-06-14', '2026-06-13', '2026-06-11', '2026-06-10']
    expect(pruneDoneDayKeys(keys)).toEqual(['2026-06-15', '2026-06-14', '2026-06-13'])
  })

  it('dedupes and handles empty input', () => {
    expect(pruneDoneDayKeys([])).toEqual([])
    expect(pruneDoneDayKeys(['2026-06-15', '2026-06-15', '2026-06-14'])).toEqual([
      '2026-06-15',
      '2026-06-14',
    ])
  })

  it('crosses a month boundary as one calendar day', () => {
    expect(pruneDoneDayKeys(['2026-07-01', '2026-06-30'])).toEqual(['2026-07-01', '2026-06-30'])
  })
})

describe('createDefaultState', () => {
  it('seeds interval/snooze, empty equipment, resolvable loadout, equipment-free built-ins', () => {
    const state: MoveState = createDefaultState()
    expect(state.settings.intervalMinutes).toBe(30)
    expect(state.settings.snoozeMinutes).toBe(5)
    expect(state.settings.ownedEquipment).toEqual([])
    expect(resolveActiveLoadout(state)).toBeTruthy()
    for (const ex of state.exercises) {
      expect(ex.updatedAt).toBe(0)
      expect(ex.custom).toBe(false)
      for (const tag of ex.tags) expect(axisOf(state.tags, tag)).not.toBe('equipment')
    }
    expect(state.exercises.length).toBeGreaterThanOrEqual(6)
  })
})
