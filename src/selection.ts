import type { Exercise, Loadout, MoveState } from './types'
import { axisOf, normalizeTag, resolveActiveLoadout } from './catalog'

/** Rule-only loadout match — no context or equipment involved. */
export function matchesLoadout(ex: Exercise, loadout: Loadout): boolean {
  const exTags = new Set(ex.tags.map(normalizeTag))
  const include = loadout.include.map(normalizeTag)
  const requireAll = loadout.requireAll.map(normalizeTag)
  const exclude = loadout.exclude.map(normalizeTag)

  if (include.length > 0 && !include.some((t) => exTags.has(t))) return false
  if (!requireAll.every((t) => exTags.has(t))) return false
  if (exclude.some((t) => exTags.has(t))) return false
  return true
}

/** matchesLoadout AND the active context AND owned-equipment constraints. */
export function isEligible(ex: Exercise, state: MoveState, loadout: Loadout): boolean {
  if (!matchesLoadout(ex, loadout)) return false

  const tags = state.tags
  const activeContext = normalizeTag(state.settings.activeContext)
  const contextIsKnown = tags.some(
    (t) => t.axis === 'context' && normalizeTag(t.name) === activeContext,
  )
  if (contextIsKnown) {
    const exContextTags = ex.tags.filter((t) => axisOf(tags, t) === 'context').map(normalizeTag)
    if (exContextTags.length > 0 && !exContextTags.includes(activeContext)) return false
  }

  const owned = new Set(state.settings.ownedEquipment.map(normalizeTag))
  for (const t of ex.tags) {
    if (axisOf(tags, t) === 'equipment' && !owned.has(normalizeTag(t))) return false
  }

  return true
}

export function eligiblePool(state: MoveState): Exercise[] {
  const loadout = resolveActiveLoadout(state)
  return state.exercises.filter((ex) => !ex.deleted && isEligible(ex, state, loadout))
}

/**
 * Pick the next exercise: null if the pool is empty; when more than one item
 * exists, exclude lastId then choose at random; otherwise return the sole item.
 */
export function selectNext(pool: Exercise[], lastId?: string): Exercise | null {
  if (pool.length === 0) return null
  if (pool.length === 1) return pool[0]
  const candidates = lastId ? pool.filter((ex) => ex.id !== lastId) : pool
  const from = candidates.length > 0 ? candidates : pool
  const index = Math.floor(Math.random() * from.length)
  return from[index]
}
