import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

// The board is saved in localStorage, so start every test from a clean slate.
beforeEach(() => {
  localStorage.clear()
})

describe('TaskFlow board', () => {
  it('renders the three columns', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'To Do' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'In Progress' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Done' })).toBeInTheDocument()
  })

  it('adds a task to a column', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(
      screen.getByLabelText(/add a task to to do/i),
      'Plan the workshop{Enter}',
    )

    expect(screen.getByText('Plan the workshop')).toBeInTheDocument()
  })
})
