import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

beforeEach(() => localStorage.clear())

describe('Move app', () => {
  it('renders the Move title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Move' })).toBeInTheDocument()
  })
})
