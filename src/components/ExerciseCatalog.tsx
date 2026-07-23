import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Exercise, ExerciseTarget, TagAxis, TagDef } from '../types'
import type { ExerciseDraft } from '../hooks/useMove'
import { MAX_IMAGE_BYTES, PLACEHOLDER_IMAGE, formatTarget, isSafeImage, normalizeTag } from '../catalog'

type ExerciseCatalogProps = {
  exercises: Exercise[]
  tags: TagDef[]
  eligibleIds: Set<string>
  onAddExercise: (draft: ExerciseDraft) => void
  onAddTag: (name: string, axis: TagAxis) => void
}

const AXES: TagAxis[] = ['equipment', 'context', 'type', 'intensity', 'duration', 'other']

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

export function ExerciseCatalog({ exercises, tags, eligibleIds, onAddExercise, onAddTag }: ExerciseCatalogProps) {
  const [name, setName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [targetKind, setTargetKind] = useState<ExerciseTarget['kind']>('reps')
  const [targetValue, setTargetValue] = useState(10)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [image, setImage] = useState(PLACEHOLDER_IMAGE)
  const [imageError, setImageError] = useState<string | null>(null)
  const [mintName, setMintName] = useState('')
  const [mintAxis, setMintAxis] = useState<TagAxis>('type')

  const toggleTag = (tagName: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      const norm = normalizeTag(tagName)
      if (next.has(norm)) next.delete(norm)
      else next.add(norm)
      return next
    })
  }

  const onFile = (file: File | undefined): void => {
    setImageError(null)
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!isSafeImage(result)) {
        setImageError('Unsupported image type — use a PNG, JPEG, GIF, WebP, AVIF or BMP.')
        return
      }
      if (byteLength(result) > MAX_IMAGE_BYTES) {
        setImageError('Image is too large.')
        return
      }
      setImage(result)
    }
    reader.onerror = () => setImageError('Could not read that file.')
    reader.readAsDataURL(file)
  }

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (!name.trim() || targetValue < 1) return
    const target: ExerciseTarget =
      targetKind === 'reps'
        ? { kind: 'reps', reps: Math.floor(targetValue) }
        : { kind: 'time', seconds: Math.floor(targetValue) }
    onAddExercise({
      name: name.trim(),
      instructions: instructions.trim(),
      target,
      image,
      tags: Array.from(selected),
      custom: true,
    })
    setName('')
    setInstructions('')
    setTargetValue(10)
    setSelected(new Set())
    setImage(PLACEHOLDER_IMAGE)
  }

  const mint = (): void => {
    const norm = normalizeTag(mintName)
    if (!norm) return
    onAddTag(norm, mintAxis)
    setSelected((prev) => new Set(prev).add(norm))
    setMintName('')
  }

  return (
    <section className="panel" aria-label="Exercise catalog">
      <h2 className="panel__title">Exercises</h2>

      <ul className="list">
        {exercises.map((ex) => (
          <li key={ex.id}>
            {ex.name} — {formatTarget(ex.target)}
            {eligibleIds.has(ex.id) && ' ✓ eligible'}
          </li>
        ))}
      </ul>

      <form onSubmit={submit} aria-label="Add custom exercise">
        <label className="field">
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          Instructions
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </label>

        <div className="field-row">
          <label className="field">
            Target type
            <select
              value={targetKind}
              onChange={(e) => setTargetKind(e.target.value as ExerciseTarget['kind'])}
            >
              <option value="reps">Reps</option>
              <option value="time">Time (seconds)</option>
            </select>
          </label>
          <label className="field">
            {targetKind === 'reps' ? 'Reps' : 'Seconds'}
            <input
              type="number"
              min={1}
              step={1}
              value={targetValue}
              onChange={(e) => setTargetValue(Number(e.target.value))}
            />
          </label>
        </div>

        <label className="field">
          Image (optional)
          <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {imageError && <p className="error">{imageError}</p>}

        <fieldset className="field">
          <legend>Tags</legend>
          <div className="tag-chips">
            {tags.map((t) => (
              <label key={t.name} className="chip">
                <input
                  type="checkbox"
                  checked={selected.has(normalizeTag(t.name))}
                  onChange={() => toggleTag(t.name)}
                />
                {t.name} ({t.axis})
              </label>
            ))}
          </div>
        </fieldset>

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

        <button type="submit" className="btn btn--primary">
          Add exercise
        </button>
      </form>
    </section>
  )
}
