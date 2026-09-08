import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

import ActionPanel from './ActionPanel'

const PLAYERS = [
  { id: 'p1', name: 'SETSU', avatar: '/images/Setsu.png', alive: true, cryoslept: false },
  { id: 'p2', name: 'JINA', avatar: '/images/Jina.png', alive: true, cryoslept: false },
  { id: 'p3', name: 'SQ', avatar: '/images/SQ.png', alive: false, cryoslept: true },
  { id: 'p4', name: 'REM', avatar: '/images/Rem.png', alive: true, cryoslept: false },
]

const baseProps = (over = {}) => ({
  phase: 'WARP',
  role: 'ENGINEER',
  players: PLAYERS,
  lastCryoId: null,
  onAction: vi.fn(),
  actionResult: null,
  privateInfo: { actionDone: false, partners: [] },
  myId: 'p1',
  ...over,
})

beforeEach(() => {
  sessionStorage.clear()
})

describe('ActionPanel — renders only for acting roles in action phases', () => {
  it('returns null outside WARP/ROLE_ACTIONS', () => {
    const { container } = render(<ActionPanel {...baseProps({ phase: 'DISCUSSION' })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('returns null for HUMAN role', () => {
    const { container } = render(<ActionPanel {...baseProps({ role: 'HUMAN' })} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ActionPanel — ENGINEER', () => {
  it('shows scan targets and fires onAction for the chosen player', async () => {
    const onAction = vi.fn()
    render(<ActionPanel {...baseProps({ role: 'ENGINEER', onAction })} />)

    expect(screen.getByText('Who will you investigate?')).toBeInTheDocument()

    // p2 is the first alive target (p1 is self, excluded)
    const card = screen.getByAltText('JINA').closest('.holo-card')
    await act(async () => { fireEvent.click(card) })

    expect(onAction).toHaveBeenCalledWith('p2')
  })

  it('excludes dead players and self from scan targets', () => {
    render(<ActionPanel {...baseProps({ role: 'ENGINEER' })} />)
    // p3 (SQ) is dead → excluded. Also p1 (self) excluded. Only p2 + p4 remain.
    const jpNames = Array.from(document.querySelectorAll('.holo-card-jp')).map((el) => el.textContent)
    expect(jpNames).toHaveLength(2)
  })
})

describe('ActionPanel — DOCTOR', () => {
  it('shows only cryoslept subjects for analysis', () => {
    render(<ActionPanel {...baseProps({ role: 'DOCTOR' })} />)
    expect(screen.getByText('Cryo-bay Autopsy')).toBeInTheDocument()
    // Only SQ is cryoslept
    const frozen = Array.from(document.querySelectorAll('.doc-label')).filter((el) => el.textContent === 'FROZEN')
    expect(frozen).toHaveLength(1)
  })

  it('shows a placeholder when no one is in cold sleep', () => {
    const allAlive = PLAYERS.map((p) => ({ ...p, alive: true, cryoslept: false }))
    render(<ActionPanel {...baseProps({ role: 'DOCTOR', players: allAlive })} />)
    expect(screen.getByText('// NO SUBJECTS CURRENTLY IN COLD SLEEP //')).toBeInTheDocument()
  })
})

describe('ActionPanel — GUARDIAN_ANGEL', () => {
  it('fires onAction with the selected protected player', async () => {
    const onAction = vi.fn()
    render(<ActionPanel {...baseProps({ role: 'GUARDIAN_ANGEL', onAction })} />)

    const card = screen.getByAltText('JINA').closest('.ga-card')
    await act(async () => { fireEvent.click(card) })

    expect(onAction).toHaveBeenCalledWith('p2')
  })
})

describe('ActionPanel — GNOSIA', () => {
  it('hides fellow Gnosia partners from kill targets', () => {
    render(<ActionPanel {...baseProps({ role: 'GNOSIA', privateInfo: { actionDone: false, partners: ['p2'] } })} />)

    const enNames = Array.from(document.querySelectorAll('.g-card-en')).map((el) => el.textContent)
    expect(enNames).toContain('REM') // p4 targetable
    expect(enNames).not.toContain('JINA') // p2 partner excluded
    expect(enNames).not.toContain('SETSU') // self excluded
  })

  it('does not fire a second action once done', async () => {
    const onAction = vi.fn()
    render(<ActionPanel {...baseProps({ role: 'GNOSIA', onAction })} />)

    const card = screen.getByAltText('REM').closest('.g-card')
    await act(async () => { fireEvent.click(card) })
    expect(onAction).toHaveBeenCalledTimes(1)

    // After actionDone, the selection grid is replaced by the locked screen.
    expect(screen.getByText('TARGET LOCKED — ELIMINATION IN PROGRESS')).toBeInTheDocument()
    expect(screen.queryByText('REM')).not.toBeInTheDocument()
  })
})

describe('ActionPanel — reconnect recovery', () => {
  it('restores actionDone true when the server says the action is complete', async () => {
    render(<ActionPanel {...baseProps({ role: 'ENGINEER', privateInfo: { actionDone: true } })} />)
    await waitFor(() => {
      expect(screen.getByText('SCANNING... AWAITING RESULTS')).toBeInTheDocument()
    })
  })
})