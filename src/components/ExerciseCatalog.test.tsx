import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExerciseCatalog } from './ExerciseCatalog'
import type { Exercise } from '../types'

// A built-in exercise carries a root-relative BASE_URL image path (not a data URL).
const builtin: Exercise = {
  id: 'ex-neck',
  name: 'Neck rolls',
  instructions: 'Roll your neck slowly.',
  target: { kind: 'reps', reps: 10 },
  image: '/exercises/neck-rolls.jpg',
  tags: ['mobility'],
  custom: false,
  updatedAt: 1,
}

const deletedEx: Exercise = {
  id: 'ex-gone',
  name: 'Removed move',
  instructions: '',
  target: { kind: 'reps', reps: 5 },
  image: '/exercises/gone.jpg',
  tags: [],
  custom: false,
  deleted: true,
  updatedAt: 1,
}

function setup(overrides: Partial<Parameters<typeof ExerciseCatalog>[0]> = {}) {
  const props = {
    exercises: [builtin],
    tags: [],
    eligibleIds: new Set<string>(),
    onAddExercise: vi.fn(),
    onUpdateExercise: vi.fn(),
    onDeleteExercise: vi.fn(),
    onAddTag: vi.fn(),
    ...overrides,
  }
  const { container } = render(<ExerciseCatalog {...props} />)
  return { ...props, container }
}

afterEach(() => vi.restoreAllMocks())

describe('ExerciseCatalog', () => {
  it('renders an image for each listed exercise', () => {
    const { container } = setup({ exercises: [builtin, { ...builtin, id: 'ex-2', name: 'Shrugs' }] })
    const imgs = container.querySelectorAll('img.catalog__image')
    expect(imgs).toHaveLength(2)
    expect(imgs[0]).toHaveAttribute('src', '/exercises/neck-rolls.jpg')
  })

  it('does not render soft-deleted exercises', () => {
    setup({ exercises: [builtin, deletedEx] })
    expect(screen.getByText(/Neck rolls/)).toBeInTheDocument()
    expect(screen.queryByText(/Removed move/)).not.toBeInTheDocument()
  })

  it('editing a built-in preserves its BASE_URL image through submit', async () => {
    const user = userEvent.setup()
    const props = setup()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const nameInput = screen.getByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Neck circles')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(props.onUpdateExercise).toHaveBeenCalledTimes(1)
    const [id, draft] = props.onUpdateExercise.mock.calls[0]
    expect(id).toBe('ex-neck')
    expect(draft.name).toBe('Neck circles')
    expect(draft.image).toBe('/exercises/neck-rolls.jpg')
    expect(draft.custom).toBe(false)
  })

  it('deletes only when window.confirm returns true', async () => {
    const user = userEvent.setup()

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const props = setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(props.onDeleteExercise).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(props.onDeleteExercise).toHaveBeenCalledWith('ex-neck')
  })

  it('reverts the submit button to "Add exercise" after Cancel', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Add exercise' })).toBeInTheDocument()
  })
})
