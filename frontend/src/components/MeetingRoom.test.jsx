import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../audio/LeviAudio', () => ({
  LeviAudio: { play: vi.fn(), playEffect: vi.fn(), resumeAll: vi.fn() },
}))

import MeetingRoom from './MeetingRoom'

const PLAYERS = [
  { id: 'player-1', name: 'SETSU', alive: true, role: 'HUMAN', avatar: '/images/Setsu.png' },
  { id: 'player-2', name: 'JINA', alive: true, role: 'HUMAN', avatar: '/images/Jina.png' },
  { id: 'player-3', name: 'SQ', alive: true, role: 'HUMAN', avatar: '/images/SQ.png' },
]

const baseProps = (over = {}) => ({
  players: PLAYERS,
  streams: {},
  currentPhase: 'DISCUSSION',
  role: 'HUMAN',
  privateInfo: { role: 'HUMAN', partners: [] },
  playerId: 'player-1',
  localMuted: false,
  setLocalMuted: vi.fn(),
  globalVolume: 1,
  setGlobalVolume: vi.fn(),
  onVote: vi.fn(),
  onKill: vi.fn(),
  playerName: 'SETSU',
  room: {
    roomCode: 'ABC123',
    players: PLAYERS,
    gameState: { currentVotes: {}, votingResults: {}, gnosiaStillOnboard: false },
  },
  timer: { phase: 'DISCUSSION', remainingTimeSeconds: 60 },
  messages: [],
  dmMessages: {},
  sendMessage: vi.fn(),
  onDm: vi.fn(),
  gnosiaChatMessages: [],
  sendGnosiaChat: vi.fn(),
  ...over,
})

const renderMeeting = (over = {}) => render(<MeetingRoom {...baseProps(over)} />)

beforeEach(() => {
  localStorage.clear()
})

describe('MeetingRoom — voting flow', () => {
  it('opens the confirm modal on a crew card and confirms the vote', async () => {
    const onVote = vi.fn()
    renderMeeting({ currentPhase: 'VOTING', onVote })

    // Pick a crew card by its portrait alt text (JINA), skipping self.
    const { getAllByRole } = screen
    const portraits = getAllByRole('img')
    const jina = portraits.find((img) => img.alt === 'JINA')
    expect(jina).toBeTruthy()
    await act(async () => { fireEvent.click(jina) })

    expect(screen.getByText('COLD-SLEEP PROTOCOL')).toBeInTheDocument()

    await act(async () => { fireEvent.click(screen.getByText('EXECUTE')) })
    expect(onVote).toHaveBeenCalledWith('player-2')

    // AnimatePresence plays an exit animation before unmounting the modal.
    await waitFor(() => {
      expect(screen.queryByText('COLD-SLEEP PROTOCOL')).not.toBeInTheDocument()
    }, { timeout: 2000 })
  })
})

describe('MeetingRoom — public chat', () => {
  it('sends a broadcast on enter', async () => {
    const sendMessage = vi.fn()
    renderMeeting({ sendMessage })

    const input = screen.getByPlaceholderText('BROADCAST...')
    await act(async () => { await userEvent.type(input, 'hello ship') })
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })

    expect(sendMessage).toHaveBeenCalledWith('hello ship')
    expect(input.value).toBe('')
  })
})

describe('MeetingRoom — DM flow', () => {
  it('opens the drawer, selects a target, and sends a DM', async () => {
    const onDm = vi.fn()
    renderMeeting({ onDm })

    await act(async () => { fireEvent.click(screen.getByText(/COMMS/)) })

    const avatars = screen.getAllByRole('img')
    const jinaAvatar = avatars.find((img) => img.alt === 'JINA')
    await act(async () => { fireEvent.click(jinaAvatar) })

    const dmInput = screen.getByPlaceholderText('Type message...')
    await act(async () => { await userEvent.type(dmInput, 'meet me at the reactor') })
    await act(async () => { fireEvent.keyDown(dmInput, { key: 'Enter' }) })

    expect(onDm).toHaveBeenCalledWith('player-2', 'meet me at the reactor')
    expect(dmInput.value).toBe('')
  })
})

describe('MeetingRoom — cleanup', () => {
  it('removes the one-time autoplay listeners on unmount', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    const { unmount } = renderMeeting()
    unmount()

    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('touchstart', expect.any(Function))
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})