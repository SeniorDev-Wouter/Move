import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Exercise } from '../types'
import { ReminderBubble } from './ReminderBubble'
import { PLACEHOLDER_IMAGE } from '../catalog'

const exercise: Exercise = {
  id: 'ex-test',
  name: 'Calf raises',
  instructions: 'Rise onto the balls of your feet, then lower slowly.',
  target: { kind: 'reps', reps: 20 },
  image: PLACEHOLDER_IMAGE,
  tags: [],
  custom: false,
  updatedAt: 0,
}

describe('ReminderBubble', () => {
  it('renders the name, formatted target and instructions', () => {
    render(<ReminderBubble exercise={exercise} onAction={() => {}} />)
    expect(screen.getByText('Calf raises')).toBeInTheDocument()
    expect(screen.getByText('20 reps')).toBeInTheDocument()
    expect(screen.getByText(/Rise onto the balls/)).toBeInTheDocument()
  })

  it('fires onAction for each of Done / Skip / Snooze / Shuffle', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<ReminderBubble exercise={exercise} onAction={onAction} />)

    for (const label of ['Done', 'Skip', 'Snooze', 'Shuffle']) {
      await user.click(screen.getByRole('button', { name: label }))
    }

    expect(onAction.mock.calls.map((c) => c[0])).toEqual(['done', 'skip', 'snooze', 'shuffle'])
  })
})
