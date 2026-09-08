import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

import LandingPage from './LandingPage'

describe('LandingPage — navigation', () => {
  it('renders the GNOSIA title', () => {
    render(<LandingPage onPlay={vi.fn()} onCreateRoom={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /GNOSIA/ })).toBeInTheDocument()
  })

  it('calls onPlay from the primary button', () => {
    const onPlay = vi.fn()
    render(<LandingPage onPlay={onPlay} onCreateRoom={vi.fn()} />)
    fireEvent.click(screen.getByText(/ENTER THE SHIP/))
    expect(onPlay).toHaveBeenCalled()
  })

  it('calls onCreateRoom from the private room button', () => {
    const onCreateRoom = vi.fn()
    render(<LandingPage onPlay={vi.fn()} onCreateRoom={onCreateRoom} />)
    fireEvent.click(screen.getByText(/CREATE PRIVATE ROOM/))
    expect(onCreateRoom).toHaveBeenCalled()
  })
})

describe('LandingPage — how to play modal', () => {
  it('opens the instructions modal then closes it', async () => {
    render(<LandingPage onPlay={vi.fn()} onCreateRoom={vi.fn()} />)

    fireEvent.click(screen.getByText('HOW TO PLAY'))
    expect(screen.getByText(/SYSTEM INSTRUCTIONS/)).toBeInTheDocument()

    await act(async () => { fireEvent.click(screen.getByText('CLOSE TERMINAL')) })
    expect(screen.queryByText(/SYSTEM INSTRUCTIONS/)).not.toBeInTheDocument()
  })
})

describe('LandingPage — crew readout', () => {
  it('lists the starting crew subset', () => {
    render(<LandingPage onPlay={vi.fn()} onCreateRoom={vi.fn()} />)
    for (const crew of ['SETSU', 'JINA', 'SQ', 'STELLA']) {
      expect(screen.getByText(crew)).toBeInTheDocument()
    }
  })
})