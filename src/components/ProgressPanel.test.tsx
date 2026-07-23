import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressPanel } from './ProgressPanel'
import { SITTING_BREAKS_SOURCE } from '../progress'

describe('ProgressPanel', () => {
  const stats = {
    done: 6,
    ignored: 2,
    streak: 3,
    sittingBreaks: 6,
    estActiveMinutes: 12,
    source: SITTING_BREAKS_SOURCE,
  }

  it('cites the source on the factual sitting-breaks figure', () => {
    render(<ProgressPanel stats={stats} perExercise={[]} log={[]} />)
    expect(screen.getByText('Sitting breaks taken: 6')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(SITTING_BREAKS_SOURCE))).toBeInTheDocument()
  })

  it('labels the active-minutes line as a playful estimate', () => {
    render(<ProgressPanel stats={stats} perExercise={[]} log={[]} />)
    expect(screen.getByText(/playful estimate/i)).toBeInTheDocument()
    expect(screen.getByText(/12 active minutes/)).toBeInTheDocument()
  })

  it('renders per-exercise totals and log rows from provided props', () => {
    const at = new Date(2026, 6, 23, 10, 0, 0).getTime()
    render(
      <ProgressPanel
        stats={stats}
        perExercise={[{ name: 'Neck rolls', count: 4 }]}
        log={[{ name: 'Neck rolls', action: 'done', at }]}
      />,
    )
    expect(screen.getByText('Neck rolls ×4')).toBeInTheDocument()
    expect(screen.getByText(/Neck rolls — done —/)).toBeInTheDocument()
  })

  it('shows bare times for a single-day log and dates for a multi-day log', () => {
    const day1 = new Date(2026, 6, 23, 9, 0, 0).getTime()
    const day1Later = new Date(2026, 6, 23, 15, 0, 0).getTime()
    const day2 = new Date(2026, 6, 22, 9, 0, 0).getTime()

    const { rerender } = render(
      <ProgressPanel
        stats={stats}
        perExercise={[]}
        log={[
          { name: 'Neck rolls', action: 'done', at: day1 },
          { name: 'Neck rolls', action: 'skip', at: day1Later },
        ]}
      />,
    )
    const singleDayDate = new Date(day1).toLocaleDateString()
    expect(screen.queryByText(new RegExp(singleDayDate.replace(/\//g, '\\/')))).not.toBeInTheDocument()

    rerender(
      <ProgressPanel
        stats={stats}
        perExercise={[]}
        log={[
          { name: 'Neck rolls', action: 'done', at: day1 },
          { name: 'Neck rolls', action: 'skip', at: day2 },
        ]}
      />,
    )
    expect(screen.getAllByText(new RegExp(singleDayDate.replace(/\//g, '\\/'))).length).toBeGreaterThan(0)
  })

  it('renders "Removed exercise" for a row with an unresolved name', () => {
    render(
      <ProgressPanel
        stats={stats}
        perExercise={[{ name: 'Removed exercise', count: 2 }]}
        log={[{ name: 'Removed exercise', action: 'done', at: Date.now() }]}
      />,
    )
    expect(screen.getByText('Removed exercise ×2')).toBeInTheDocument()
    expect(screen.getByText(/Removed exercise — done —/)).toBeInTheDocument()
  })

  it('renders the muted "Nothing yet." state for an empty log', () => {
    render(<ProgressPanel stats={stats} perExercise={[]} log={[]} />)
    expect(screen.getAllByText('Nothing yet.').length).toBeGreaterThan(0)
  })
})
