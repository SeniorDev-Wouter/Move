import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

beforeEach(() => localStorage.clear())

describe('Move app — fresh visitor', () => {
  it('shows the Move title, a paused Start control, and the default Office-safe loadout', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Move' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()

    // Reminders start paused: no reminder-action buttons are on screen.
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()

    const officeSafe = screen.getByRole('radio', { name: 'Office-safe' })
    expect(officeSafe).toBeChecked()
  })

  it('exposes an axis picker in the mint UI', () => {
    render(<App />)
    const catalog = screen.getByRole('region', { name: 'Exercise catalog' })
    const axis = within(catalog).getByLabelText('Axis')
    expect(axis).toBeInTheDocument()
    expect(within(axis as HTMLSelectElement).getByRole('option', { name: 'type' })).toBeInTheDocument()
  })
})

describe('Move app — flows', () => {
  it('a custom exercise tagged with a newly minted tag becomes eligible', async () => {
    const user = userEvent.setup()
    render(<App />)

    const catalog = screen.getByRole('region', { name: 'Exercise catalog' })

    // Mint a fresh non-context, non-equipment tag so the exercise stays eligible.
    await user.type(within(catalog).getByLabelText('Tag name'), 'focus')
    await user.selectOptions(within(catalog).getByLabelText('Axis'), 'type')
    await user.click(within(catalog).getByRole('button', { name: 'Mint tag' }))

    // Create the custom exercise (the minted tag is auto-selected).
    await user.type(within(catalog).getByLabelText('Name'), 'Deep breathing')
    await user.click(within(catalog).getByRole('button', { name: 'Add exercise' }))

    const eligible = screen.getByRole('region', { name: 'Eligible now' })
    expect(within(eligible).getByText('Deep breathing')).toBeInTheDocument()
  })

  it('switching the active loadout changes the eligible set', async () => {
    const user = userEvent.setup()
    render(<App />)

    const eligible = screen.getByRole('region', { name: 'Eligible now' })
    expect(within(eligible).getByText('Neck rolls')).toBeInTheDocument()

    const library = screen.getByRole('region', { name: 'Loadout library' })
    await user.click(within(library).getByRole('button', { name: 'New loadout' }))
    await user.type(within(library).getByLabelText('Loadout name'), 'Strength only')
    await user.selectOptions(within(library).getByLabelText('Add tag to Require all'), 'strength')
    await user.click(within(library).getByRole('button', { name: 'Save loadout' }))

    await user.click(within(library).getByRole('radio', { name: 'Strength only' }))

    expect(within(eligible).queryByText('Neck rolls')).not.toBeInTheDocument()
    expect(within(eligible).getByText('Calf raises')).toBeInTheDocument()
  })
})
