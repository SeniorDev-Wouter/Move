import type {
  Exercise,
  HistoryEntry,
  Loadout,
  MoveState,
  ReminderAction,
  Rollup,
  Settings,
  TagAxis,
  TagDef,
} from './types'
import { createDefaultState, normalizeTag } from './catalog'

export const STORAGE_KEY = 'move.state'

/**
 * Stable stringify: recursively sort object keys so equal content yields
 * byte-identical output. Array order is preserved — callers pre-sort arrays
 * into canonical order via canonicalizeState.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const byNormName = (a: TagDef, b: TagDef): number => {
  const na = normalizeTag(a.name)
  const nb = normalizeTag(b.name)
  return na < nb ? -1 : na > nb ? 1 : 0
}
const asc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function canonicalLoadout(l: Loadout): Loadout {
  return {
    ...l,
    include: [...l.include].sort(asc),
    requireAll: [...l.requireAll].sort(asc),
    exclude: [...l.exclude].sort(asc),
  }
}

/** Return a structurally-canonical copy: every array sorted deterministically. */
function canonicalizeState(state: MoveState): MoveState {
  return {
    settings: { ...state.settings, ownedEquipment: [...state.settings.ownedEquipment].sort(asc) },
    exercises: [...state.exercises].sort(byId),
    loadouts: [...state.loadouts].map(canonicalLoadout).sort(byId),
    history: [...state.history].sort(byId),
    rollup: { ...state.rollup, doneDayKeys: [...state.rollup.doneDayKeys].sort(asc) },
    tags: [...state.tags].sort(byNormName),
  }
}

export function serialize(state: MoveState): string {
  return stableStringify(canonicalizeState(state))
}

/** A total-order "newer wins" pick: greater updatedAt, tie => smaller canonical form. */
function pickNewer<T extends { updatedAt: number }>(x: T, y: T): T {
  if (x.updatedAt > y.updatedAt) return x
  if (y.updatedAt > x.updatedAt) return y
  return stableStringify(x) <= stableStringify(y) ? x : y
}

function mergeByKey<T extends { updatedAt: number }>(
  as: T[],
  bs: T[],
  keyOf: (item: T) => string,
): T[] {
  const map = new Map<string, T>()
  for (const item of [...as, ...bs]) {
    const key = keyOf(item)
    const existing = map.get(key)
    map.set(key, existing ? pickNewer(existing, item) : item)
  }
  return Array.from(map.values())
}

/** Union history entries by id; on a colliding id keep the deterministic smaller form. */
function mergeHistory(as: HistoryEntry[], bs: HistoryEntry[]): HistoryEntry[] {
  const map = new Map<string, HistoryEntry>()
  for (const e of [...as, ...bs]) {
    const existing = map.get(e.id)
    if (!existing) map.set(e.id, e)
    else map.set(e.id, stableStringify(existing) <= stableStringify(e) ? existing : e)
  }
  return Array.from(map.values())
}

function mergeRollup(a: Rollup, b: Rollup): Rollup {
  if (a.trimmedThroughAt > b.trimmedThroughAt) return a
  if (b.trimmedThroughAt > a.trimmedThroughAt) return b
  return {
    trimmedThroughAt: a.trimmedThroughAt,
    done: Math.max(a.done, b.done),
    ignored: Math.max(a.ignored, b.ignored),
    doneDayKeys: Array.from(new Set([...a.doneDayKeys, ...b.doneDayKeys])),
  }
}

export function mergeState(a: MoveState, b: MoveState): MoveState {
  const settings = pickNewer(a.settings, b.settings)
  const exercises = mergeByKey(a.exercises, b.exercises, (e) => e.id)
  const loadouts = mergeByKey(a.loadouts, b.loadouts, (l) => l.id)
  const tags = mergeByKey(a.tags, b.tags, (t) => normalizeTag(t.name))
  const rollup = mergeRollup(a.rollup, b.rollup)
  const history = mergeHistory(a.history, b.history).filter((e) => e.at > rollup.trimmedThroughAt)
  return canonicalizeState({ settings, exercises, loadouts, history, rollup, tags })
}

// ---- Validation (localStorage is untrusted) -------------------------------

function isString(v: unknown): v is string {
  return typeof v === 'string'
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString)
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const ACTIONS: readonly ReminderAction[] = ['done', 'skip', 'snooze', 'shuffle']
const AXES: readonly TagAxis[] = ['equipment', 'context', 'type', 'intensity', 'duration', 'other']

function isTarget(v: unknown): v is Exercise['target'] {
  if (!isRecord(v)) return false
  if (v.kind === 'reps') return isFiniteNumber(v.reps)
  if (v.kind === 'time') return isFiniteNumber(v.seconds)
  return false
}

function isExercise(v: unknown): v is Exercise {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.name) &&
    isString(v.instructions) &&
    isTarget(v.target) &&
    isString(v.image) &&
    isStringArray(v.tags) &&
    typeof v.custom === 'boolean' &&
    (v.deleted === undefined || typeof v.deleted === 'boolean') &&
    isFiniteNumber(v.updatedAt)
  )
}

function isLoadout(v: unknown): v is Loadout {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.name) &&
    isStringArray(v.include) &&
    isStringArray(v.requireAll) &&
    isStringArray(v.exclude) &&
    isFiniteNumber(v.updatedAt)
  )
}

function isTagDef(v: unknown): v is TagDef {
  return (
    isRecord(v) &&
    isString(v.name) &&
    isString(v.axis) &&
    (AXES as string[]).includes(v.axis) &&
    isFiniteNumber(v.updatedAt)
  )
}

function isHistoryEntry(v: unknown): v is HistoryEntry {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.occurrenceId) &&
    isString(v.exerciseId) &&
    isString(v.action) &&
    (ACTIONS as string[]).includes(v.action) &&
    isFiniteNumber(v.at)
  )
}

function validSettings(v: unknown, fallback: Settings): Settings {
  if (
    isRecord(v) &&
    isFiniteNumber(v.intervalMinutes) &&
    isFiniteNumber(v.snoozeMinutes) &&
    isString(v.activeContext) &&
    isStringArray(v.ownedEquipment) &&
    isString(v.activeLoadoutId) &&
    isFiniteNumber(v.updatedAt)
  ) {
    return {
      intervalMinutes: v.intervalMinutes,
      snoozeMinutes: v.snoozeMinutes,
      activeContext: v.activeContext,
      ownedEquipment: v.ownedEquipment,
      activeLoadoutId: v.activeLoadoutId,
      updatedAt: v.updatedAt,
    }
  }
  return fallback
}

function validRollup(v: unknown, fallback: Rollup): Rollup {
  if (
    isRecord(v) &&
    isFiniteNumber(v.done) &&
    isFiniteNumber(v.ignored) &&
    isStringArray(v.doneDayKeys) &&
    isFiniteNumber(v.trimmedThroughAt)
  ) {
    return {
      done: v.done,
      ignored: v.ignored,
      doneDayKeys: v.doneDayKeys,
      trimmedThroughAt: v.trimmedThroughAt,
    }
  }
  return fallback
}

export function loadState(): MoveState {
  const defaults = createDefaultState()
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return defaults
  }
  if (!raw) return defaults

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaults
  }
  if (!isRecord(parsed)) return defaults

  const loaded: MoveState = {
    settings: validSettings(parsed.settings, defaults.settings),
    exercises: Array.isArray(parsed.exercises) ? parsed.exercises.filter(isExercise) : [],
    loadouts: Array.isArray(parsed.loadouts) ? parsed.loadouts.filter(isLoadout) : [],
    history: Array.isArray(parsed.history) ? parsed.history.filter(isHistoryEntry) : [],
    rollup: validRollup(parsed.rollup, defaults.rollup),
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter(isTagDef) : [],
  }

  // Re-merge built-ins so built-in exercises/tags/loadouts are always present.
  return mergeState(defaults, loaded)
}

let lastWritten: string | null = null

export function saveState(state: MoveState): void {
  const s = serialize(state)
  if (s === lastWritten) return
  try {
    localStorage.setItem(STORAGE_KEY, s)
    lastWritten = s
  } catch {
    console.warn('move: failed to persist state to localStorage')
  }
}
