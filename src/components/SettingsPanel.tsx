import type { Settings, TagDef } from '../types'
import { normalizeTag } from '../catalog'

type SettingsPanelProps = {
  settings: Settings
  tags: TagDef[]
  running: boolean
  onStart: () => void
  onStop: () => void
  onIntervalChange: (minutes: number) => void
  onSnoozeChange: (minutes: number) => void
  onContextChange: (name: string) => void
  onToggleEquipment: (name: string) => void
}

/** Positive-integer parse; ignores blanks/invalid, floors to a minimum of 1. */
function toPositiveInt(value: string): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const floored = Math.floor(n)
  return floored >= 1 ? floored : null
}

export function SettingsPanel({
  settings,
  tags,
  running,
  onStart,
  onStop,
  onIntervalChange,
  onSnoozeChange,
  onContextChange,
  onToggleEquipment,
}: SettingsPanelProps) {
  const contextTags = tags.filter((t) => t.axis === 'context')
  const equipmentTags = tags.filter((t) => t.axis === 'equipment')
  const owned = new Set(settings.ownedEquipment.map(normalizeTag))

  return (
    <section className="panel" aria-label="Settings">
      <h2 className="panel__title">Settings</h2>

      <div className="field-row">
        <label className="field">
          Interval (minutes)
          <input
            type="number"
            min={1}
            step={1}
            value={settings.intervalMinutes}
            onChange={(e) => {
              const n = toPositiveInt(e.target.value)
              if (n !== null) onIntervalChange(n)
            }}
          />
        </label>
        <label className="field">
          Snooze (minutes)
          <input
            type="number"
            min={1}
            step={1}
            value={settings.snoozeMinutes}
            onChange={(e) => {
              const n = toPositiveInt(e.target.value)
              if (n !== null) onSnoozeChange(n)
            }}
          />
        </label>
      </div>

      <button
        type="button"
        className="btn btn--primary"
        onClick={running ? onStop : onStart}
      >
        {running ? 'Stop' : 'Start'}
      </button>

      <label className="field">
        Context
        <select value={settings.activeContext} onChange={(e) => onContextChange(e.target.value)}>
          {contextTags.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="field">
        <legend>Equipment I own</legend>
        {equipmentTags.length === 0 ? (
          <span className="muted">No equipment tags yet.</span>
        ) : (
          equipmentTags.map((t) => (
            <label key={t.name} className="chip">
              <input
                type="checkbox"
                checked={owned.has(normalizeTag(t.name))}
                onChange={() => onToggleEquipment(t.name)}
              />
              {t.name}
            </label>
          ))
        )}
      </fieldset>
    </section>
  )
}
