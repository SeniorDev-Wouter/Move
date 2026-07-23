import { useState } from 'react'
import type { ImportResult, Loadout, MoveState, TagAxis, TagDef } from '../types'
import { exportBundle } from '../loadouts'
import { newId } from '../id'
import { TagRuleEditor } from './TagRuleEditor'

type LoadoutLibraryProps = {
  loadouts: Loadout[]
  activeLoadoutId: string
  tags: TagDef[]
  state: MoveState
  onSetActive: (id: string) => void
  onSaveLoadout: (loadout: Loadout) => void
  onAddTag: (name: string, axis: TagAxis) => void
  onImportBundle: (raw: unknown, opts?: { axisConflicts?: Record<string, 'keep' | 'rename'> }) => ImportResult['warnings']
}

function freshLoadout(): Loadout {
  return { id: newId(), name: '', include: [], requireAll: [], exclude: [], updatedAt: 0 }
}

export function LoadoutLibrary({
  loadouts,
  activeLoadoutId,
  tags,
  state,
  onSetActive,
  onSaveLoadout,
  onAddTag,
  onImportBundle,
}: LoadoutLibraryProps) {
  const [draft, setDraft] = useState<Loadout | null>(null)
  const [exportText, setExportText] = useState('')
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<ImportResult['warnings']>([])
  const [choices, setChoices] = useState<Record<string, 'keep' | 'rename'>>({})

  const activeName = loadouts.find((l) => l.id === activeLoadoutId)?.name ?? '—'

  const saveDraft = (): void => {
    if (!draft || !draft.name.trim()) return
    onSaveLoadout({ ...draft, name: draft.name.trim() })
    setDraft(null)
  }

  const doExport = (id: string): void => {
    try {
      setExportText(JSON.stringify(exportBundle(state, id), null, 2))
    } catch (err) {
      setExportText('')
      setImportError(err instanceof Error ? err.message : String(err))
    }
  }

  const runImport = (opts?: { axisConflicts?: Record<string, 'keep' | 'rename'> }): void => {
    try {
      const warnings = onImportBundle(importText, opts)
      setImportError(null)
      setConflicts(warnings)
      setChoices(Object.fromEntries(warnings.map((w) => [w.name, 'keep' as const])))
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
      setConflicts([])
    }
  }

  return (
    <section className="panel" aria-label="Loadout library">
      <h2 className="panel__title">Loadouts</h2>
      <p>
        Active: <strong>{activeName}</strong>
      </p>

      <fieldset className="field">
        <legend>Switch active loadout</legend>
        {loadouts.map((l) => (
          <label key={l.id} className="chip">
            <input
              type="radio"
              name="active-loadout"
              checked={l.id === activeLoadoutId}
              onChange={() => onSetActive(l.id)}
            />
            {l.name}
          </label>
        ))}
      </fieldset>

      <div className="field-row">
        <button type="button" className="btn" onClick={() => setDraft(freshLoadout())}>
          New loadout
        </button>
        {loadouts.map((l) => (
          <button key={l.id} type="button" className="btn" onClick={() => setDraft({ ...l })}>
            Edit {l.name}
          </button>
        ))}
      </div>

      {draft && (
        <div className="panel" aria-label="Edit loadout">
          <label className="field">
            Loadout name
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <TagRuleEditor loadout={draft} tags={tags} onChange={setDraft} onAddTag={onAddTag} />
          <div className="field-row">
            <button type="button" className="btn btn--primary" onClick={saveDraft}>
              Save loadout
            </button>
            <button type="button" className="btn" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <fieldset className="field">
        <legend>Export a loadout bundle</legend>
        <div className="tag-chips">
          {loadouts.map((l) => (
            <button key={l.id} type="button" className="btn" onClick={() => doExport(l.id)}>
              Export {l.name}
            </button>
          ))}
        </div>
        {exportText && (
          <label className="field">
            Exported bundle
            <textarea readOnly value={exportText} />
          </label>
        )}
      </fieldset>

      <fieldset className="field">
        <legend>Import a loadout bundle</legend>
        <label className="field">
          Bundle text
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} />
        </label>
        <button type="button" className="btn" onClick={() => runImport()}>
          Import
        </button>
        {importError && <p className="error">{importError}</p>}
        {conflicts.length > 0 && (
          <div className="panel" aria-label="Resolve axis conflicts">
            <p className="muted">
              Some tags have a different axis than your local copy. Keep yours, or re-import them
              under a fresh name.
            </p>
            {conflicts.map((c) => (
              <fieldset key={c.name} className="field">
                <legend>
                  {c.name}: yours is “{c.localAxis}”, bundle says “{c.bundleAxis}”
                </legend>
                <label className="chip">
                  <input
                    type="radio"
                    name={`conflict-${c.name}`}
                    checked={(choices[c.name] ?? 'keep') === 'keep'}
                    onChange={() => setChoices((p) => ({ ...p, [c.name]: 'keep' }))}
                  />
                  Keep mine
                </label>
                <label className="chip">
                  <input
                    type="radio"
                    name={`conflict-${c.name}`}
                    checked={choices[c.name] === 'rename'}
                    onChange={() => setChoices((p) => ({ ...p, [c.name]: 'rename' }))}
                  />
                  Rename bundle tag
                </label>
              </fieldset>
            ))}
            <button type="button" className="btn" onClick={() => runImport({ axisConflicts: choices })}>
              Re-import with these choices
            </button>
          </div>
        )}
      </fieldset>
    </section>
  )
}
