import { useState } from 'react'
import type { Loadout, TagAxis, TagDef } from '../types'
import { normalizeTag } from '../catalog'

type RuleKey = 'include' | 'requireAll' | 'exclude'

type TagRuleEditorProps = {
  loadout: Loadout
  tags: TagDef[]
  onChange: (loadout: Loadout) => void
  onAddTag: (name: string, axis: TagAxis) => void
}

const AXES: TagAxis[] = ['equipment', 'context', 'type', 'intensity', 'duration', 'other']
const RULES: { key: RuleKey; label: string }[] = [
  { key: 'include', label: 'Include (any of)' },
  { key: 'requireAll', label: 'Require all' },
  { key: 'exclude', label: 'Exclude' },
]

/** Edit a loadout's include / require-all / exclude lists; mint tags with an axis picker. */
export function TagRuleEditor({ loadout, tags, onChange, onAddTag }: TagRuleEditorProps) {
  const [mintName, setMintName] = useState('')
  const [mintAxis, setMintAxis] = useState<TagAxis>('type')

  const addToRule = (key: RuleKey, name: string): void => {
    const norm = normalizeTag(name)
    if (!norm || loadout[key].map(normalizeTag).includes(norm)) return
    onChange({ ...loadout, [key]: [...loadout[key], norm] })
  }

  const removeFromRule = (key: RuleKey, name: string): void => {
    onChange({ ...loadout, [key]: loadout[key].filter((t) => t !== name) })
  }

  const mint = (): void => {
    const norm = normalizeTag(mintName)
    if (!norm) return
    onAddTag(norm, mintAxis)
    setMintName('')
  }

  return (
    <div className="panel">
      {RULES.map(({ key, label }) => {
        const available = tags.filter((t) => !loadout[key].map(normalizeTag).includes(normalizeTag(t.name)))
        return (
          <fieldset key={key} className="field">
            <legend>{label}</legend>
            <div className="tag-chips">
              {loadout[key].length === 0 && <span className="muted">none</span>}
              {loadout[key].map((name) => (
                <span key={name} className="chip">
                  {name}
                  <button
                    type="button"
                    className="btn"
                    aria-label={`Remove ${name} from ${label}`}
                    onClick={() => removeFromRule(key, name)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <label className="field">
              Add tag to {label}
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) addToRule(key, e.target.value)
                }}
              >
                <option value="">Choose a tag…</option>
                {available.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} ({t.axis})
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        )
      })}

      <fieldset className="field">
        <legend>Mint a new tag</legend>
        <label className="field">
          Tag name
          <input type="text" value={mintName} onChange={(e) => setMintName(e.target.value)} />
        </label>
        <label className="field">
          Axis
          <select value={mintAxis} onChange={(e) => setMintAxis(e.target.value as TagAxis)}>
            {AXES.map((axis) => (
              <option key={axis} value={axis}>
                {axis}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={mint}>
          Mint tag
        </button>
      </fieldset>
    </div>
  )
}
