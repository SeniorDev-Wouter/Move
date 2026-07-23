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
    render(<ProgressPanel stats={stats} />)
    expect(screen.getByText('Sitting breaks taken: 6')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(SITTING_BREAKS_SOURCE))).toBeInTheDocument()
  })

  it('labels the active-minutes line as a playful estimate', () => {
    render(<ProgressPanel stats={stats} />)
    expect(screen.getByText(/playful estimate/i)).toBeInTheDocument()
    expect(screen.getByText(/12 active minutes/)).toBeInTheDocument()
  })
})
