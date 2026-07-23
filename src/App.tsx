import { useEffect, useMemo, useState } from 'react'
import { useMove } from './hooks/useMove'
import { useReminderEngine } from './hooks/useReminderEngine'
import { eligiblePool } from './selection'
import { deriveStats, deriveActivity } from './progress'
import { RetroWindow } from './components/RetroWindow'
import { Assistant } from './components/Assistant'
import { CountdownTimer } from './components/CountdownTimer'
import { SettingsPanel } from './components/SettingsPanel'
import { LoadoutLibrary } from './components/LoadoutLibrary'
import { ExerciseCatalog } from './components/ExerciseCatalog'
import { ProgressPanel } from './components/ProgressPanel'

function App() {
  const move = useMove()
  const [notice, setNotice] = useState<string | null>(null)
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null)

  // Adopt the active service-worker registration for rich notifications.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    let cancelled = false
    navigator.serviceWorker.ready
      .then((reg) => {
        if (!cancelled) setSwRegistration(reg)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const engine = useReminderEngine({
    state: move.state,
    recordAction: move.recordAction,
    trim: move.trim,
    swRegistration,
    onNotice: setNotice,
  })

  const pool = useMemo(() => eligiblePool(move.state), [move.state])
  const eligibleIds = useMemo(() => new Set(pool.map((ex) => ex.id)), [pool])
  const stats = useMemo(
    () => deriveStats(move.state.rollup, move.state.history),
    [move.state.rollup, move.state.history],
  )
  const activity = useMemo(
    () => deriveActivity(move.state.rollup, move.state.history),
    [move.state.rollup, move.state.history],
  )
  const exerciseNameById = useMemo(
    () => new Map(move.state.exercises.map((ex) => [ex.id, ex.name])),
    [move.state.exercises],
  )
  const perExercise = useMemo(
    () =>
      activity.perExercise.map((p) => ({
        name: exerciseNameById.get(p.exerciseId) ?? 'Removed exercise',
        count: p.count,
      })),
    [activity, exerciseNameById],
  )
  const activityLog = useMemo(
    () =>
      activity.log.map((e) => ({
        name: exerciseNameById.get(e.exerciseId) ?? 'Removed exercise',
        action: e.action,
        at: e.at,
      })),
    [activity, exerciseNameById],
  )

  const handleStart = (): void => {
    setNotice(null)
    void engine.start()
  }

  return (
    <div className="desktop">
      <RetroWindow title="Move">
        <Assistant current={engine.current} notice={notice} onAction={engine.handleAction} />
        <CountdownTimer
          nextFireAt={engine.nextFireAt}
          running={engine.running}
          current={engine.current}
        />

        <div className="workspace">
          <SettingsPanel
            settings={move.state.settings}
            tags={move.state.tags}
            running={engine.running}
            onStart={handleStart}
            onStop={engine.stop}
            onIntervalChange={move.setIntervalMinutes}
            onSnoozeChange={move.setSnooze}
            onContextChange={move.setContext}
            onToggleEquipment={move.toggleEquipment}
          />

          <LoadoutLibrary
            loadouts={move.state.loadouts}
            activeLoadoutId={move.state.settings.activeLoadoutId}
            tags={move.state.tags}
            state={move.state}
            onSetActive={move.setActiveLoadout}
            onSaveLoadout={move.saveLoadout}
            onAddTag={move.addTag}
            onImportBundle={move.importBundle}
          />

          <ExerciseCatalog
            exercises={move.state.exercises}
            tags={move.state.tags}
            eligibleIds={eligibleIds}
            onAddExercise={move.addExercise}
            onAddTag={move.addTag}
          />

          <ProgressPanel stats={stats} perExercise={perExercise} log={activityLog} />
        </div>

        <section className="panel" aria-label="Eligible now">
          <h2 className="panel__title">Eligible now ({pool.length})</h2>
          <ul className="list">
            {pool.length === 0 ? (
              <li className="muted">No eligible exercises — adjust your loadout.</li>
            ) : (
              pool.map((ex) => <li key={ex.id}>{ex.name}</li>)
            )}
          </ul>
        </section>
      </RetroWindow>
    </div>
  )
}

export default App
