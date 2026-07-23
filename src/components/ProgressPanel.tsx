type Stats = {
  done: number
  ignored: number
  streak: number
  sittingBreaks: number
  estActiveMinutes: number
  source: string
}

type ProgressPanelProps = { stats: Stats }

export function ProgressPanel({ stats }: ProgressPanelProps) {
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
    </section>
  )
}
