import type { ReminderAction } from '../types'
import { localDayKey } from '../catalog'

type Stats = {
  done: number
  ignored: number
  streak: number
  sittingBreaks: number
  estActiveMinutes: number
  source: string
}

type ProgressPanelProps = {
  stats: Stats
  perExercise: { name: string; count: number }[]
  log: { name: string; action: ReminderAction; at: number }[]
}

export function ProgressPanel({ stats, perExercise, log }: ProgressPanelProps) {
  const multiDay = new Set(log.map((e) => localDayKey(e.at))).size > 1

  return (
    <section className="panel" aria-label="Progress">
      <h2 className="panel__title">Progress</h2>
      <ul className="list">
        <li>Done: {stats.done}</li>
        <li>Skipped / ignored: {stats.ignored}</li>
        <li>Current streak: {stats.streak} day{stats.streak === 1 ? '' : 's'}</li>
      </ul>

      <p>
        <strong>Sitting breaks taken: {stats.sittingBreaks}</strong>
        <br />
        <span className="muted">Source: {stats.source}</span>
      </p>

      <p>
        ≈ {stats.estActiveMinutes} active minutes{' '}
        <span className="muted">(a playful estimate — not a medical figure)</span>
      </p>

      <h3 className="panel__subtitle">Per exercise</h3>
      <ul className="list">
        {perExercise.length === 0 ? (
          <li className="muted">Nothing yet.</li>
        ) : (
          perExercise.map((p, i) => (
            <li key={`${p.name}-${i}`}>
              {p.name} ×{p.count}
            </li>
          ))
        )}
      </ul>

      <h3 className="panel__subtitle">Activity log</h3>
      <ul className="list">
        {log.length === 0 ? (
          <li className="muted">Nothing yet.</li>
        ) : (
          log.map((e, i) => {
            const d = new Date(e.at)
            const when = multiDay
              ? `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
              : d.toLocaleTimeString()
            return (
              <li key={i}>
                {e.name} — {e.action} — {when}
              </li>
            )
          })
        )}
      </ul>
    </section>
  )
}
