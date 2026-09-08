import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import CreateRoom from './CreateRoom'

beforeEach(() => {
  localStorage.clear()
})

describe('CreateRoom — defaults', () => {
  it('renders with default participants of 5 and a 6-char auto room code', () => {
    render(<CreateRoom onSave={vi.fn()} onBack={vi.fn()} />)

    expect(screen.getByText('CREATE A ROOM')).toBeInTheDocument()
    const roomCodeChars = document.querySelectorAll('.code-char')
    expect(roomCodeChars.length).toBe(6)
    expect(document.querySelector('.count-display')).toHaveTextContent('5')
  })

  it('generates a code using only the unambiguous alphabet', () => {
    render(<CreateRoom onSave={vi.fn()} onBack={vi.fn()} />)
    const text = Array.from(document.querySelectorAll('.code-char'))
      .map((el) => el.textContent)
      .join('')
    expect(text).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })
})

describe('CreateRoom — PIN input', () => {
  it('strips non-numeric characters and caps at 6 digits', async () => {
    render(<CreateRoom onSave={vi.fn()} onBack={vi.fn()} />)

    const pinInput = screen.getByDisplayValue(/^\d{4}$/) // initial random 4-digit pin
    await act(async () => { await userEvent.clear(pinInput) })
    await act(async () => { await userEvent.type(pinInput, '12abc3456789') })

    expect(pinInput.value).toBe('123456')
  })
})

describe('CreateRoom — participant slider', () => {
  it('updates participant count up to 15', async () => {
    render(<CreateRoom onSave={vi.fn()} onBack={vi.fn()} />)

    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '15' } })

    expect(screen.getByText('15')).toBeInTheDocument()
  })
})

describe('CreateRoom — save & back actions', () => {
  it('invokes onSave with the generated room code, participants, and pin after a delay', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn()
    render(<CreateRoom onSave={onSave} onBack={vi.fn()} />)

    const initialPin = document.querySelector('.pin-input').value
    fireEvent.change(screen.getByRole('slider'), { target: { value: '10' } })

    fireEvent.click(screen.getByText('SAVE'))
    expect(screen.getByText('LAUNCHING...')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(900) })

    expect(onSave).toHaveBeenCalledTimes(1)
    const payload = onSave.mock.calls[0][0]
    expect(payload.participants).toBe(10)
    expect(payload.pin).toBe(initialPin)
    expect(payload.roomCode).toMatch(/^[A-Z0-9]{6}$/)
    vi.useRealTimers()
  })

  it('invokes onBack when BACK is clicked', () => {
    const onBack = vi.fn()
    render(<CreateRoom onSave={vi.fn()} onBack={onBack} />)
    fireEvent.click(screen.getByText('BACK'))
    expect(onBack).toHaveBeenCalled()
  })
})