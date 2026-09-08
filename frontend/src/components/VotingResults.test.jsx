import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import VotingResults from './VotingResults'

const PLAYERS = [
  { id: 'p1', name: 'SETSU', avatar: '/images/Setsu.png' },
  { id: 'p2', name: 'JINA', avatar: '/images/Jina.png' },
  { id: 'p3', name: 'SQ', avatar: '/images/SQ.png' },
]

describe('VotingResults — tally', () => {
  it('shows the vote count for every player', () => {
    render(<VotingResults
      players={PLAYERS}
      currentVotes={{ a: 'p2', b: 'p2', c: 'p3' }}
      phase="RESULT"
      lastCryosleptPlayerId={null}
      gnosiaStillOnboard
    />)

    const badges = Array.from(document.querySelectorAll('.vote-badge-polygon')).map((el) => el.textContent)
    expect(badges).toEqual(['0', '2', '1'])
    expect(screen.getByText('VOTING TALLY REVEAL')).toBeInTheDocument()
  })

  it('marks the most-voted player with the voted-most class', () => {
    render(<VotingResults
      players={PLAYERS}
      currentVotes={{ a: 'p2', b: 'p2' }}
      phase="RESULT"
      lastCryosleptPlayerId="p2"
      gnosiaStillOnboard
    />)

    const mostVoted = document.querySelectorAll('.vote-card.voted-most')
    expect(mostVoted).toHaveLength(1)
    expect(mostVoted[0].textContent).toContain('JINA')
  })
})

describe('VotingResults — execution mode', () => {
  it('renders stasis protocol when in CRYOSLEEP with a selected player', () => {
    render(<VotingResults
      players={PLAYERS}
      currentVotes={{ a: 'p2', b: 'p2' }}
      phase="CRYOSLEEP"
      lastCryosleptPlayerId="p2"
      gnosiaStillOnboard
    />)

    expect(screen.getByText('STASIS PROTOCOL INITIATED')).toBeInTheDocument()
    expect(screen.getByText('⚠ GNOSIA THREAT DETECTED ONBOARD ⚠')).toBeInTheDocument()
  })

  it('shows the clean-clear readout when no gnosia remain onboard', () => {
    render(<VotingResults
      players={PLAYERS}
      currentVotes={{}}
      phase="CRYOSLEEP"
      lastCryosleptPlayerId="p2"
      gnosiaStillOnboard={false}
    />)

    expect(screen.getByText('NO GNOSIA SIGNATURES DETECTED')).toBeInTheDocument()
  })
})