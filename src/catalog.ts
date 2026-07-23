import type { Exercise, ExerciseTarget, Loadout, MoveState, TagAxis, TagDef } from './types'

export const MAX_DELAY_MS = 2 ** 31 - 1
export const HISTORY_CAP = 5000
export const DEDUPE_WINDOW_MS = 10_000
export const MAX_IMAGE_BYTES = 512 * 1024
export const MAX_BUNDLE_BYTES = 2 * 1024 * 1024

/** A 1x1 transparent PNG used as the default exercise image. */
export const PLACEHOLDER_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/** Media types accepted by isSafeImage — raster formats only, never SVG. */
const RASTER_ALLOWLIST = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
]

export function normalizeTag(name: string): string {
  return name.trim().toLowerCase()
}

export function axisOf(tags: TagDef[], name: string): TagAxis {
  const target = normalizeTag(name)
  const def = tags.find((t) => normalizeTag(t.name) === target)
  return def ? def.axis : 'other'
}

export function formatTarget(target: ExerciseTarget): string {
  return target.kind === 'reps' ? `${target.reps} reps` : `${target.seconds}s`
}

/** Build `${y}-${mm}-${dd}` from LOCAL date parts (DST-safe streaks). */
export function localDayKey(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mm}-${dd}`
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

export function isSafeImage(s: string): boolean {
  if (s === PLACEHOLDER_IMAGE) return true
  const lower = s.toLowerCase()
  if (!lower.startsWith('data:')) return false
  const rest = s.slice('data:'.length)
  const end = rest.search(/[;,]/)
  if (end === -1) return false
  const mediaType = rest.slice(0, end).toLowerCase()
  return RASTER_ALLOWLIST.includes(mediaType)
}

export function resolveActiveLoadout(state: MoveState): Loadout {
  const active = state.loadouts.find((l) => l.id === state.settings.activeLoadoutId)
  if (active) return active
  const officeSafe = state.loadouts.find((l) => l.name === 'Office-safe')
  return officeSafe ?? state.loadouts[0]
}

/**
 * Dedupe, sort descending, then keep the contiguous run of days ending today:
 * each kept key must be exactly one calendar day earlier than the previous one.
 * Stop at the first gap — keys before a gap can never extend today's streak.
 */
export function pruneDoneDayKeys(keys: string[]): string[] {
  const sorted = Array.from(new Set(keys)).sort().reverse()
  if (sorted.length === 0) return []
  const kept = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === previousDayKey(kept[kept.length - 1])) kept.push(sorted[i])
    else break
  }
  return kept
}

export const DEFAULT_LOADOUT: Loadout = {
  id: 'loadout-office-safe',
  name: 'Office-safe',
  include: [],
  requireAll: [],
  exclude: [],
  updatedAt: 0,
}

export const SEEDED_TAGS: TagDef[] = [
  { name: 'office', axis: 'context', updatedAt: 0 },
  { name: 'home', axis: 'context', updatedAt: 0 },
  { name: 'outdoors', axis: 'context', updatedAt: 0 },
  { name: 'mobility', axis: 'type', updatedAt: 0 },
  { name: 'cardio', axis: 'type', updatedAt: 0 },
  { name: 'strength', axis: 'type', updatedAt: 0 },
  { name: 'low', axis: 'intensity', updatedAt: 0 },
  { name: 'moderate', axis: 'intensity', updatedAt: 0 },
  { name: 'short', axis: 'duration', updatedAt: 0 },
  { name: 'medium', axis: 'duration', updatedAt: 0 },
]

const asset = (p: string) => `${import.meta.env.BASE_URL}${p}`

export const BUILTIN_EXERCISES: Exercise[] = [
  {
    id: 'ex-neck-rolls',
    name: 'Neck rolls',
    instructions: 'Slowly roll your head in a circle, five times each direction.',
    target: { kind: 'time', seconds: 30 },
    image: asset('exercises/neck-rolls.jpg'),
    tags: ['office', 'mobility', 'low', 'short'],
    custom: false,
    updatedAt: 0,
  },
  {
    id: 'ex-shoulder-shrugs',
    name: 'Shoulder shrugs',
    instructions: 'Lift both shoulders toward your ears, hold briefly, release.',
    target: { kind: 'reps', reps: 15 },
    image: asset('exercises/shoulder-shrugs.jpg'),
    tags: ['office', 'mobility', 'low', 'short'],
    custom: false,
    updatedAt: 0,
  },
  {
    id: 'ex-seated-marches',
    name: 'Seated marches',
    instructions: 'Sitting tall, lift each knee in turn as if marching in place.',
    target: { kind: 'time', seconds: 60 },
    image: asset('exercises/seated-marches.jpg'),
    tags: ['office', 'cardio', 'moderate', 'medium'],
    custom: false,
    updatedAt: 0,
  },
  {
    id: 'ex-calf-raises',
    name: 'Calf raises',
    instructions: 'Stand and rise onto the balls of your feet, then lower slowly.',
    target: { kind: 'reps', reps: 20 },
    image: asset('exercises/calf-raises.jpg'),
    tags: ['office', 'strength', 'low', 'short'],
    custom: false,
    updatedAt: 0,
  },
  {
    id: 'ex-wrist-stretches',
    name: 'Wrist stretches',
    instructions: 'Extend one arm, gently pull the fingers back, then switch sides.',
    target: { kind: 'time', seconds: 30 },
    image: asset('exercises/wrist-stretches.jpg'),
    tags: ['office', 'mobility', 'low', 'short'],
    custom: false,
    updatedAt: 0,
  },
  {
    id: 'ex-seated-twists',
    name: 'Seated spinal twists',
    instructions: 'Sitting tall, rotate your torso to each side and hold briefly.',
    target: { kind: 'reps', reps: 10 },
    image: asset('exercises/seated-spinal-twists.webp'),
    tags: ['office', 'mobility', 'low', 'short'],
    custom: false,
    updatedAt: 0,
  },
  {
    id: 'ex-desk-pushups',
    name: 'Desk push-ups',
    instructions: 'Hands on the desk edge, lower your chest toward it and press back up.',
    target: { kind: 'reps', reps: 12 },
    image: asset('exercises/desk-pushups.jpg'),
    tags: ['office', 'strength', 'moderate', 'short'],
    custom: false,
    updatedAt: 0,
  },
  {
    id: 'ex-ankle-circles',
    name: 'Ankle circles',
    instructions: 'Lift one foot and draw slow circles with your ankle, then switch.',
    target: { kind: 'time', seconds: 30 },
    image: asset('exercises/ankle-circles.png'),
    tags: ['office', 'mobility', 'low', 'short'],
    custom: false,
    updatedAt: 0,
  },
]

export function createDefaultState(): MoveState {
  return {
    settings: {
      intervalMinutes: 30,
      snoozeMinutes: 5,
      activeContext: 'office',
      ownedEquipment: [],
      activeLoadoutId: DEFAULT_LOADOUT.id,
      updatedAt: 0,
    },
    exercises: BUILTIN_EXERCISES,
    loadouts: [DEFAULT_LOADOUT],
    history: [],
    rollup: { done: 0, ignored: 0, doneDayKeys: [], trimmedThroughAt: 0 },
    tags: SEEDED_TAGS,
  }
}
