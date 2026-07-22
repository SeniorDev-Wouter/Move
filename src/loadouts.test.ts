import { describe, expect, it } from 'vitest'
import { exportBundle, importBundle } from './loadouts'
import { createDefaultState, MAX_BUNDLE_BYTES, MAX_IMAGE_BYTES, PLACEHOLDER_IMAGE } from './catalog'
import { eligiblePool } from './selection'
import type { Exercise, Loadout, LoadoutBundle, MoveState, TagDef } from './types'

function ex(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-custom-1',
    name: 'Custom exercise',
    instructions: 'Do the thing.',
    target: { kind: 'reps', reps: 10 },
    image: PLACEHOLDER_IMAGE,
    tags: [],
    custom: true,
    updatedAt: 0,
    ...overrides,
  }
}

function loadout(overrides: Partial<Loadout> = {}): Loadout {
  return {
    id: 'loadout-1',
    name: 'Custom loadout',
    include: [],
    requireAll: [],
    exclude: [],
    updatedAt: 0,
    ...overrides,
  }
}

function tag(overrides: Partial<TagDef> = {}): TagDef {
  return { name: 'gear', axis: 'equipment', updatedAt: 0, ...overrides }
}

function stateWith(overrides: Partial<MoveState> = {}): MoveState {
  return { ...createDefaultState(), ...overrides }
}

describe('exportBundle', () => {
  it('throws when the loadout does not exist', () => {
    expect(() => exportBundle(createDefaultState(), 'missing')).toThrow()
  })

  it('embeds only custom exercises matching the loadout and exactly the referenced tags', () => {
    const l = loadout({ include: ['gear'] })
    const matching = ex({ id: 'ex-a', tags: ['gear', 'strength'] })
    const nonMatchingRule = ex({ id: 'ex-b', tags: ['other-tag'] })
    const builtIn = ex({ id: 'ex-c', tags: ['gear'], custom: false })
    const state = stateWith({
      loadouts: [l],
      exercises: [matching, nonMatchingRule, builtIn],
      tags: [
        tag({ name: 'gear', axis: 'equipment' }),
        tag({ name: 'strength', axis: 'type' }),
        tag({ name: 'unused', axis: 'other' }),
      ],
    })

    const bundle = exportBundle(state, l.id)

    expect(bundle.version).toBe(1)
    expect(bundle.exercises).toEqual([matching])
    expect(bundle.tags.map((t) => t.name).sort()).toEqual(['gear', 'strength'])
  })
})

describe('importBundle', () => {
  it('rejects a version other than 1', () => {
    const bundle = { version: 2, loadout: loadout(), exercises: [], tags: [] }
    expect(() => importBundle(createDefaultState(), bundle)).toThrow()
  })

  it('rejects an oversize bundle', () => {
    const hugeName = 'x'.repeat(MAX_BUNDLE_BYTES + 1)
    const bundle = { version: 1, loadout: loadout({ name: hugeName }), exercises: [], tags: [] }
    expect(() => importBundle(createDefaultState(), bundle)).toThrow()
  })

  it('rejects an oversize image', () => {
    const hugeImage = `data:image/png;base64,${'A'.repeat(MAX_IMAGE_BYTES + 1)}`
    const bundle: LoadoutBundle = {
      version: 1,
      loadout: loadout(),
      exercises: [ex({ image: hugeImage })],
      tags: [],
    }
    expect(() => importBundle(createDefaultState(), bundle)).toThrow()
  })

  it.each([
    'data:text/html,<script>alert(1)</script>',
    'javascript:alert(1)',
    'data:image/svg+xml,<svg/>',
    'data:image/SVG,<svg/>',
    'data:image/svg,<svg/>',
  ])('rejects unsafe image %s', (unsafeImage) => {
    const bundle: LoadoutBundle = {
      version: 1,
      loadout: loadout(),
      exercises: [ex({ image: unsafeImage })],
      tags: [],
    }
    expect(() => importBundle(createDefaultState(), bundle)).toThrow()
  })

  it('rejects a bundle referencing a tag name with no resolvable TagDef', () => {
    const bundle: LoadoutBundle = {
      version: 1,
      loadout: loadout({ include: ['ghost-tag'] }),
      exercises: [],
      tags: [],
    }
    expect(() => importBundle(createDefaultState(), bundle)).toThrow()
  })

  it('mints a fresh id on collision with a different local exercise, leaving the local exercise untouched', () => {
    const localExercise = ex({ id: 'shared-id', name: 'Local version' })
    const state = stateWith({ exercises: [...createDefaultState().exercises, localExercise] })
    const incoming = ex({ id: 'shared-id', name: 'Bundle version' })
    const bundle: LoadoutBundle = { version: 1, loadout: loadout(), exercises: [incoming], tags: [] }

    const result = importBundle(state, bundle)

    const local = result.state.exercises.find((e) => e.id === 'shared-id')
    expect(local).toEqual(localExercise)
    const imported = result.state.exercises.find((e) => e.name === 'Bundle version')
    expect(imported).toBeDefined()
    expect(imported?.id).not.toBe('shared-id')
  })

  it('skips an exercise identical to a local one instead of duplicating it', () => {
    const localExercise = ex({ id: 'shared-id', name: 'Same' })
    const state = stateWith({ exercises: [...createDefaultState().exercises, localExercise] })
    const bundle: LoadoutBundle = {
      version: 1,
      loadout: loadout(),
      exercises: [ex({ id: 'shared-id', name: 'Same' })],
      tags: [],
    }

    const result = importBundle(state, bundle)

    expect(result.state.exercises.filter((e) => e.id === 'shared-id')).toHaveLength(1)
  })

  it('keeps the local axis and records a warning on an axis conflict with default (keep) policy', () => {
    const state = stateWith({ tags: [...createDefaultState().tags, tag({ name: 'bands', axis: 'equipment' })] })
    const bundle: LoadoutBundle = {
      version: 1,
      loadout: loadout({ include: ['bands'] }),
      exercises: [],
      tags: [tag({ name: 'bands', axis: 'type', updatedAt: 5 })],
    }

    const result = importBundle(state, bundle)

    expect(result.warnings).toEqual([{ name: 'bands', localAxis: 'equipment', bundleAxis: 'type' }])
    const bandsTag = result.state.tags.find((t) => t.name === 'bands')
    expect(bandsTag?.axis).toBe('equipment')
  })

  it('mints a fresh tag and rewrites exercises and loadout rules on an axis conflict with rename policy', () => {
    const state = stateWith({ tags: [...createDefaultState().tags, tag({ name: 'bands', axis: 'equipment' })] })
    const bundle: LoadoutBundle = {
      version: 1,
      loadout: loadout({ include: ['bands'] }),
      exercises: [ex({ tags: ['bands'] })],
      tags: [tag({ name: 'bands', axis: 'type', updatedAt: 5 })],
    }

    const knownNames = new Set(state.tags.map((t) => t.name))
    const result = importBundle(state, bundle, { axisConflicts: { bands: 'rename' } })

    expect(result.warnings).toEqual([])
    const localBands = result.state.tags.find((t) => t.name === 'bands')
    expect(localBands?.axis).toBe('equipment')
    const freshTags = result.state.tags.filter((t) => !knownNames.has(t.name))
    expect(freshTags).toHaveLength(1)
    expect(freshTags[0].axis).toBe('type')
    const freshName = freshTags[0].name

    const importedLoadout = result.state.loadouts.find((l) => l.name === 'Custom loadout')
    expect(importedLoadout?.include).toEqual([freshName])
    const importedExercise = result.state.exercises.find((e) => e.name === 'Custom exercise')
    expect(importedExercise?.tags).toEqual([freshName])
  })

  it('collapses differently-cased tag names into a single normalized tag', () => {
    const state = stateWith({ tags: [...createDefaultState().tags, tag({ name: 'Bands', axis: 'equipment' })] })
    const bundle: LoadoutBundle = {
      version: 1,
      loadout: loadout(),
      exercises: [],
      tags: [tag({ name: 'bands', axis: 'equipment', updatedAt: 1 })],
    }

    const result = importBundle(state, bundle)

    const matches = result.state.tags.filter((t) => t.name.toLowerCase() === 'bands')
    expect(matches).toHaveLength(1)
  })

  it('round-trips a loadout export/import into a fresh state, preserving eligibility', () => {
    const l = loadout({ id: 'loadout-round-trip', include: ['gear'] })
    const customExercise = ex({ id: 'ex-round-trip', tags: ['gear'] })
    const sourceState = stateWith({
      loadouts: [l],
      exercises: [...createDefaultState().exercises, customExercise],
      tags: [...createDefaultState().tags, tag({ name: 'gear', axis: 'equipment' })],
    })

    const bundle = exportBundle(sourceState, l.id)
    const targetState = createDefaultState()
    const result = importBundle(targetState, bundle)

    const importedLoadout = result.state.loadouts.find((lo) => lo.name === l.name)
    expect(importedLoadout).toBeDefined()
    if (!importedLoadout) throw new Error('unreachable')

    const originalEligible = eligiblePool({ ...sourceState, settings: { ...sourceState.settings, activeLoadoutId: l.id } })
    const importedEligible = eligiblePool({
      ...result.state,
      settings: { ...result.state.settings, activeLoadoutId: importedLoadout.id },
    })

    expect(importedEligible.map((e) => e.name).sort()).toEqual(originalEligible.map((e) => e.name).sort())
  })
})
