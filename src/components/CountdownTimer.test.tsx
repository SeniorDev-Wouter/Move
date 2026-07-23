import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Exercise } from '../types'
import type { CurrentReminder } from '../hooks/useReminderEngine'
import { PLACEHOLDER_IMAGE } from '../catalog'
import { CountdownTimer } from './CountdownTimer'

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

const current: CurrentReminder = { exercise, occurrenceId: 'occ-1' }

const NOW = 1_700_000_000_000

describe('CountdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders Paused / press Start when stopped with no schedule', () => {
    render(<CountdownTimer nextFireAt={null} running={false} current={null} />)
    expect(screen.getByText('Paused / press Start')).toBeInTheDocument()
  })

  it('renders a live mm:ss countdown when nextFireAt is set, even if local running is false', () => {
    render(<CountdownTimer nextFireAt={NOW + 90_000} running={false} current={null} />)
    expect(screen.getByText('1:30')).toBeInTheDocument()
  })

  it('renders Waiting for schedule… when running with no schedule yet', () => {
    render(<CountdownTimer nextFireAt={null} running={true} current={null} />)
    expect(screen.getByText('Waiting for schedule…')).toBeInTheDocument()
  })

  it('renders Respond to the reminder when a reminder is current', () => {
    render(<CountdownTimer nextFireAt={NOW + 90_000} running={true} current={current} />)
    expect(screen.getByText('Respond to the reminder')).toBeInTheDocument()
  })

  it('formats minutes unpadded and seconds padded for a long interval', () => {
    render(<CountdownTimer nextFireAt={NOW + 120 * 60_000} running={true} current={null} />)
    expect(screen.getByText('120:00')).toBeInTheDocument()
  })

  it('does not arm the 1s interval in paused/hold/idle states', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const { rerender } = render(<CountdownTimer nextFireAt={null} running={false} current={null} />)
    expect(setIntervalSpy).not.toHaveBeenCalled()

    rerender(<CountdownTimer nextFireAt={null} running={true} current={null} />)
    expect(setIntervalSpy).not.toHaveBeenCalled()

    rerender(<CountdownTimer nextFireAt={NOW + 90_000} running={true} current={current} />)
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it('arms the 1s interval in the live-countdown state', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    render(<CountdownTimer nextFireAt={NOW + 90_000} running={false} current={null} />)
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000)
  })
})
