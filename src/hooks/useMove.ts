import { useCallback, useEffect, useRef, useState } from 'react'
import type { Exercise, ImportResult, Loadout, MoveState, ReminderAction, TagAxis } from '../types'
import { loadState, mergeState, saveState, serialize, STORAGE_KEY } from '../storage'
import { trimHistory } from '../progress'
import { importBundle as importBundleFn } from '../loadouts'
import { newId } from '../id'
import { normalizeTag } from '../catalog'

/** An exercise as supplied by the UI — id and updatedAt are stamped on save. */
export type ExerciseDraft = Omit<Exercise, 'id' | 'updatedAt'>

export type ImportOptions = { axisConflicts?: Record<string, 'keep' | 'rename'> }

/**
 * The single state-owning hook. Owns MoveState, auto-persists only when the
 * serialized form actually changed, and reconciles cross-tab storage events via
 * mergeState — updating state only when the merged serialized form differs, so a
 * save never bounces back as a merge and vice-versa.
 */
export function useMove() {
  const [state, setState] = useState<MoveState>(loadState)
  const stateRef = useRef(state)
  stateRef.current = state
  const lastSerialized = useRef(serialize(state))

  // Persist only on a real change.
  useEffect(() => {
    const s = serialize(state)
    if (s === lastSerialized.current) return
    lastSerialized.current = s
    saveState(state)
  }, [state])

  // Cross-tab: reload + merge on a storage event for our key. Skip the update
  // entirely when the merged form is identical to what we already hold, which
  // prevents a save<->merge ping-pong between tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== null && e.key !== STORAGE_KEY) return
      const incoming = loadState()
      const merged = mergeState(stateRef.current, incoming)
      const s = serialize(merged)
      if (s === lastSerialized.current) return
      lastSerialized.current = s
      setState(merged)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setIntervalMinutes = useCallback((minutes: number) => {
    setState((s) => ({
      ...s,
      settings: { ...s.settings, intervalMinutes: minutes, updatedAt: Date.now() },
    }))
  }, [])

  const setSnooze = useCallback((minutes: number) => {
    setState((s) => ({
      ...s,
      settings: { ...s.settings, snoozeMinutes: minutes, updatedAt: Date.now() },
    }))
  }, [])

  const setContext = useCallback((name: string) => {
    setState((s) => ({
      ...s,
      settings: { ...s.settings, activeContext: name, updatedAt: Date.now() },
    }))
  }, [])

  const toggleEquipment = useCallback((name: string) => {
    setState((s) => {
      const norm = normalizeTag(name)
      const has = s.settings.ownedEquipment.some((e) => normalizeTag(e) === norm)
      const ownedEquipment = has
        ? s.settings.ownedEquipment.filter((e) => normalizeTag(e) !== norm)
        : [...s.settings.ownedEquipment, name]
      return { ...s, settings: { ...s.settings, ownedEquipment, updatedAt: Date.now() } }
    })
  }, [])

  const setActiveLoadout = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      settings: { ...s.settings, activeLoadoutId: id, updatedAt: Date.now() },
    }))
  }, [])

  const addExercise = useCallback((draft: ExerciseDraft) => {
    setState((s) => ({
      ...s,
      exercises: [...s.exercises, { ...draft, id: newId(), updatedAt: Date.now() }],
    }))
  }, [])

  // Replace the matching exercise with the draft; explicit deleted: false clears any tombstone.
  const updateExercise = useCallback((id: string, draft: ExerciseDraft) => {
    setState((s) => ({
      ...s,
      exercises: s.exercises.map((ex) =>
        ex.id === id ? { ...ex, ...draft, id, deleted: false, updatedAt: Date.now() } : ex,
      ),
    }))
  }, [])

  // Soft-delete: tombstone the exercise rather than removing it.
  const deleteExercise = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      exercises: s.exercises.map((ex) =>
        ex.id === id ? { ...ex, deleted: true, updatedAt: Date.now() } : ex,
      ),
    }))
  }, [])

  // Dedupe by normalized name: an existing tag is replaced (axis + updatedAt).
  const addTag = useCallback((name: string, axis: TagAxis) => {
    setState((s) => {
      const norm = normalizeTag(name)
      const next: MoveState['tags'][number] = { name: norm, axis, updatedAt: Date.now() }
      const idx = s.tags.findIndex((t) => normalizeTag(t.name) === norm)
      const tags = idx === -1 ? [...s.tags, next] : s.tags.map((t, i) => (i === idx ? next : t))
      return { ...s, tags }
    })
  }, [])

  // Upsert a loadout by id, stamping updatedAt.
  const saveLoadout = useCallback((loadout: Loadout) => {
    setState((s) => {
      const stamped: Loadout = { ...loadout, updatedAt: Date.now() }
      const idx = s.loadouts.findIndex((l) => l.id === loadout.id)
      const loadouts = idx === -1 ? [...s.loadouts, stamped] : s.loadouts.map((l, i) => (i === idx ? stamped : l))
      return { ...s, loadouts }
    })
  }, [])

  // Import a self-contained bundle; returns the axis-conflict warnings so the UI
  // can surface them. Throws on a malformed bundle (validated at the boundary).
  const importBundle = useCallback((raw: unknown, opts?: ImportOptions): ImportResult['warnings'] => {
    const result = importBundleFn(stateRef.current, raw, opts)
    setState(result.state)
    return result.warnings
  }, [])

  const recordAction = useCallback(
    (occurrenceId: string, exerciseId: string, action: ReminderAction) => {
      setState((s) => ({
        ...s,
        history: [
          ...s.history,
          { id: newId(), occurrenceId, exerciseId, action, at: Date.now() },
        ],
      }))
    },
    [],
  )

  // Fold overflow history into the rollup. The caller (the reminder engine)
  // gates this to the leader tab; trimHistory itself is a no-op under the cap.
  const trim = useCallback(() => {
    setState((s) => trimHistory(s))
  }, [])

  return {
    state,
    setIntervalMinutes,
    setSnooze,
    setContext,
    toggleEquipment,
    setActiveLoadout,
    addExercise,
    updateExercise,
    deleteExercise,
    addTag,
    saveLoadout,
    importBundle,
    recordAction,
    trim,
  }
}
