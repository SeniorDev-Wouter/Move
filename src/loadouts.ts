import type {
  Exercise,
  ExerciseTarget,
  ImportResult,
  Loadout,
  LoadoutBundle,
  MoveState,
  TagAxis,
  TagDef,
} from './types'
import { MAX_BUNDLE_BYTES, MAX_IMAGE_BYTES, isSafeImage, normalizeTag } from './catalog'
import { matchesLoadout } from './selection'
import { newId } from './id'

export function exportBundle(state: MoveState, loadoutId: string): LoadoutBundle {
  const loadout = state.loadouts.find((l) => l.id === loadoutId)
  if (!loadout) throw new Error(`Loadout not found: ${loadoutId}`)

  const exercises = state.exercises.filter((ex) => ex.custom && matchesLoadout(ex, loadout))

  const referenced = new Set<string>()
  for (const exercise of exercises) {
    for (const tag of exercise.tags) referenced.add(normalizeTag(tag))
  }
  for (const tag of [...loadout.include, ...loadout.requireAll, ...loadout.exclude]) {
    referenced.add(normalizeTag(tag))
  }

  const tags = state.tags.filter((t) => referenced.has(normalizeTag(t.name)))

  return { version: 1, loadout, exercises, tags }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function isTagAxis(v: unknown): v is TagAxis {
  return (
    v === 'equipment' ||
    v === 'context' ||
    v === 'type' ||
    v === 'intensity' ||
    v === 'duration' ||
    v === 'other'
  )
}

function isTagDef(v: unknown): v is TagDef {
  return isRecord(v) && typeof v.name === 'string' && isTagAxis(v.axis) && typeof v.updatedAt === 'number'
}

function isExerciseTarget(v: unknown): v is ExerciseTarget {
  if (!isRecord(v)) return false
  if (v.kind === 'reps') return typeof v.reps === 'number'
  if (v.kind === 'time') return typeof v.seconds === 'number'
  return false
}

function isExercise(v: unknown): v is Exercise {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.instructions === 'string' &&
    isExerciseTarget(v.target) &&
    typeof v.image === 'string' &&
    isStringArray(v.tags) &&
    typeof v.custom === 'boolean' &&
    typeof v.updatedAt === 'number'
  )
}

function isLoadout(v: unknown): v is Loadout {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    isStringArray(v.include) &&
    isStringArray(v.requireAll) &&
    isStringArray(v.exclude) &&
    typeof v.updatedAt === 'number'
  )
}

function parseRaw(raw: unknown): unknown {
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

function targetEquals(a: ExerciseTarget, b: ExerciseTarget): boolean {
  if (a.kind === 'reps' && b.kind === 'reps') return a.reps === b.reps
  if (a.kind === 'time' && b.kind === 'time') return a.seconds === b.seconds
  return false
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function exerciseEquals(a: Exercise, b: Exercise): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.instructions === b.instructions &&
    a.image === b.image &&
    a.custom === b.custom &&
    a.updatedAt === b.updatedAt &&
    targetEquals(a.target, b.target) &&
    arraysEqual(a.tags, b.tags)
  )
}

function rewriteTagName(tag: string, renames: Map<string, string>): string {
  return renames.get(normalizeTag(tag)) ?? tag
}

function mergeTags(
  localTags: TagDef[],
  bundleTags: TagDef[],
  axisConflicts: Record<string, 'keep' | 'rename'>,
): { tags: TagDef[]; warnings: ImportResult['warnings']; renames: Map<string, string> } {
  const tags = [...localTags]
  const warnings: ImportResult['warnings'] = []
  const renames = new Map<string, string>()

  for (const bundleTag of bundleTags) {
    const normName = normalizeTag(bundleTag.name)
    const localIndex = tags.findIndex((t) => normalizeTag(t.name) === normName)

    if (localIndex === -1) {
      tags.push(bundleTag)
      continue
    }

    const localTag = tags[localIndex]
    if (localTag.axis === bundleTag.axis) {
      tags[localIndex] = bundleTag.updatedAt > localTag.updatedAt ? bundleTag : localTag
      continue
    }

    const policy = axisConflicts[normName] ?? 'keep'
    if (policy === 'keep') {
      warnings.push({ name: normName, localAxis: localTag.axis, bundleAxis: bundleTag.axis })
      continue
    }

    const freshName = normalizeTag(newId())
    tags.push({ name: freshName, axis: bundleTag.axis, updatedAt: bundleTag.updatedAt })
    renames.set(normName, freshName)
  }

  return { tags, warnings, renames }
}

function mergeExercises(localExercises: Exercise[], incomingExercises: Exercise[]): Exercise[] {
  const merged = [...localExercises]

  for (const incoming of incomingExercises) {
    const localIndex = merged.findIndex((e) => e.id === incoming.id)
    if (localIndex === -1) {
      merged.push(incoming)
      continue
    }

    if (exerciseEquals(merged[localIndex], incoming)) continue

    merged.push({ ...incoming, id: newId() })
  }

  return merged
}

function mergeLoadout(localLoadouts: Loadout[], incoming: Loadout): Loadout {
  const collides = localLoadouts.some((l) => l.id === incoming.id)
  return collides ? { ...incoming, id: newId() } : incoming
}

export function importBundle(
  state: MoveState,
  raw: unknown,
  opts?: { axisConflicts?: Record<string, 'keep' | 'rename'> },
): ImportResult {
  const parsed = parseRaw(raw)
  if (!isRecord(parsed)) throw new Error('Bundle must be an object')

  if (byteLength(JSON.stringify(parsed)) > MAX_BUNDLE_BYTES) {
    throw new Error(`Bundle exceeds maximum size of ${MAX_BUNDLE_BYTES} bytes`)
  }

  if (parsed.version !== 1) throw new Error(`Unsupported bundle version: ${String(parsed.version)}`)
  if (!isLoadout(parsed.loadout)) throw new Error('Bundle loadout is malformed')
  if (!Array.isArray(parsed.exercises) || !parsed.exercises.every(isExercise)) {
    throw new Error('Bundle exercises are malformed')
  }
  if (!Array.isArray(parsed.tags) || !parsed.tags.every(isTagDef)) {
    throw new Error('Bundle tags are malformed')
  }

  const bundle: LoadoutBundle = {
    version: 1,
    loadout: parsed.loadout,
    exercises: parsed.exercises,
    tags: parsed.tags,
  }

  for (const exercise of bundle.exercises) {
    if (!isSafeImage(exercise.image)) throw new Error(`Exercise "${exercise.name}" has an unsafe image`)
    if (byteLength(exercise.image) > MAX_IMAGE_BYTES) {
      throw new Error(`Exercise "${exercise.name}" image exceeds maximum size of ${MAX_IMAGE_BYTES} bytes`)
    }
  }

  const knownTagNames = new Set([...bundle.tags, ...state.tags].map((t) => normalizeTag(t.name)))
  const referenced = new Set<string>()
  for (const exercise of bundle.exercises) {
    for (const tag of exercise.tags) referenced.add(normalizeTag(tag))
  }
  for (const tag of [...bundle.loadout.include, ...bundle.loadout.requireAll, ...bundle.loadout.exclude]) {
    referenced.add(normalizeTag(tag))
  }
  for (const name of referenced) {
    if (!knownTagNames.has(name)) throw new Error(`Bundle references unknown tag "${name}"`)
  }

  const axisConflicts = opts?.axisConflicts ?? {}
  const { tags: mergedTags, warnings, renames } = mergeTags(state.tags, bundle.tags, axisConflicts)

  const rewrittenExercises = bundle.exercises.map((ex) => ({
    ...ex,
    tags: ex.tags.map((t) => rewriteTagName(t, renames)),
  }))
  const rewrittenLoadout: Loadout = {
    ...bundle.loadout,
    include: bundle.loadout.include.map((t) => rewriteTagName(t, renames)),
    requireAll: bundle.loadout.requireAll.map((t) => rewriteTagName(t, renames)),
    exclude: bundle.loadout.exclude.map((t) => rewriteTagName(t, renames)),
  }

  const mergedExercises = mergeExercises(state.exercises, rewrittenExercises)
  const mergedLoadout = mergeLoadout(state.loadouts, rewrittenLoadout)

  return {
    state: {
      ...state,
      tags: mergedTags,
      exercises: mergedExercises,
      loadouts: [...state.loadouts, mergedLoadout],
    },
    warnings,
  }
}
