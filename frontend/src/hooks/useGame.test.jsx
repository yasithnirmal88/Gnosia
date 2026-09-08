import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const { clientLog } = vi.hoisted(() => ({
  clientLog: { instances: [], peerManagers: [] },
}))

vi.mock('@stomp/stompjs', () => {
  class FakeClient {
    constructor(opts = {}) {
      Object.assign(this, opts)
      this.connected = false
      this.active = false
      this.subs = {}
      this.published = []
      this.__gnosiaSubs = new Set()
      this.deactivateCount = 0
      clientLog.instances.push(this)
    }
    activate() {
      this.active = true
      this.connected = true
      if (this.onConnect) this.onConnect()
    }
    deactivate() {
      this.deactivateCount += 1
      this.active = false
      this.connected = false
      if (this.onDisconnect) this.onDisconnect()
    }
    subscribe(destination, callback) {
      this.subs[destination] = callback
      return { unsubscribe: () => { delete this.subs[destination] } }
    }
    publish(frame) {
      this.published.push(frame)
    }
  }
  return { Client: FakeClient }
})

vi.mock('sockjs-client', () => ({
  default: class SockJS {}
}))

vi.mock('../audio/LeviAudio', () => ({
  LeviAudio: { play: vi.fn(), playEffect: vi.fn(), resumeAll: vi.fn() },
}))

vi.mock('../webrtc/peerManager', () => {
  class MeshPeerManager {
    constructor() {
      this.handleSignal = vi.fn()
      this.synchronize = vi.fn()
      this.teardown = vi.fn()
      clientLog.peerManagers.push(this)
    }
  }
  return { MeshPeerManager }
})

import { useGame } from './useGame'

const PRIVATE_TOPIC = (key) => `/topic/private/${key}`

const roomPayload = (over = {}) => ({
  roomCode: 'ABC123',
  players: [
    { id: 'player-1', name: 'SETSU', alive: true },
    { id: 'player-2', name: 'JINA', alive: true },
  ],
  // Mirrors a real room frame (GameState.java defaults) so the exact shape the
  // zod-router normalizes to can be asserted with a strict toEqual.
  gameState: {
    phase: 'LOBBY',
    remainingTimeSeconds: 90,
    currentVotes: {},
    lastRoleResults: {},
    leviObservations: [],
    behavioralInsights: {},
    gnosiaVotes: {},
    votingResults: {},
    playerActionDone: {},
    gnosiaStillOnboard: false,
    ...over,
  },
})

const emit = (client, dest, payload) => {
  act(() => client.subs[dest]({ body: JSON.stringify(payload) }))
}

beforeEach(() => {
  clientLog.instances.length = 0
  clientLog.peerManagers.length = 0
  localStorage.clear()
  localStorage.setItem('gnosia_player_id', 'player-1')
  localStorage.setItem('gnosia_identity_key', 'test-key')
})

describe('useGame connection lifecycle', () => {
  it('connects and subscribes to the join room topics + private topic', () => {
    const { result } = renderHook(() => useGame('ABC123'))
    act(() => result.current.connect(''))

    const c = clientLog.instances[0]
    expect(c.activated).toBeUndefined()
    expect(c.subs['/topic/room/ABC123']).toBeTypeOf('function')
    expect(c.subs['/topic/room/ABC123/timer']).toBeTypeOf('function')
    expect(c.subs['/topic/room/ABC123/chat']).toBeTypeOf('function')
    expect(c.subs['/topic/room/ABC123/events']).toBeTypeOf('function')
    expect(c.subs[PRIVATE_TOPIC('test-key')]).toBeTypeOf('function')
    expect(c.published).toEqual([
      expect.objectContaining({
        destination: '/app/room/ABC123/join',
        body: expect.stringContaining('"id":"player-1"'),
      }),
    ])
    expect(result.current.stompReady).toBe(true)
  })

  it('dedupes subscriptions within a single connection', () => {
    const { result } = renderHook(() => useGame('ABC123'))
    act(() => result.current.connect(''))
    const c = clientLog.instances[0]
    const subCount = Object.keys(c.subs).length

    act(() => result.current.subscribeToState('ABC123'))

    expect(Object.keys(c.subs).length).toBe(subCount)
    expect(c.published.filter((p) => p.destination.endsWith('/join')).length).toBe(1)
  })

  it('resubscribes after a transport drop (reconnect)', () => {
    const { result } = renderHook(() => useGame('ABC123'))
    act(() => result.current.connect(''))
    const c1 = clientLog.instances[0]

    // Simulate socket close + reconnect.
    act(() => c1.onWebSocketClose())
    expect(result.current.stompReady).toBe(false)
    expect(c1.__gnosiaSubs.size).toBe(0)

    act(() => result.current.connect(''))
    const c2 = clientLog.instances[1]
    expect(c1.deactivateCount).toBe(1)
    expect(c2.subs['/topic/room/ABC123']).toBeTypeOf('function')
    expect(c2.subs[PRIVATE_TOPIC('test-key')]).toBeTypeOf('function')
    expect(c2.__gnosiaSubs.has('ABC123')).toBe(true)
    expect(result.current.stompReady).toBe(true)
  })

  it('ignores callbacks from a superseded client', () => {
    const { result } = renderHook(() => useGame('ABC123'))
    act(() => result.current.connect(''))
    act(() => result.current.connect(''))
    const c1 = clientLog.instances[0]
    const c2 = clientLog.instances[1]

    // A late frame from the stale client should not clobber state.
    emit(c1, '/topic/room/ABC123', roomPayload())
    expect(result.current.room).toBeNull()

    emit(c2, '/topic/room/ABC123', roomPayload())
    expect(result.current.room).toEqual(roomPayload())
  })

  it('subscribes to a newly created room via ROOM_CREATED', () => {
    const { result } = renderHook(() => useGame(''))
    act(() => result.current.connect(''))
    const c = clientLog.instances[0]

    act(() => c.subs[PRIVATE_TOPIC('test-key')]({
      body: JSON.stringify({ type: 'ROOM_CREATED', roomCode: 'ZZ99', players: [], config: { maxPlayers: 6 } }),
    }))

    expect(c.subs['/topic/room/ZZ99']).toBeTypeOf('function')
    expect(c.published.some((p) => p.destination === '/app/room/ZZ99/join')).toBe(true)
  })

  it('deactivates the socket on unmount', () => {
    const { result, unmount } = renderHook(() => useGame('ABC123'))
    act(() => result.current.connect(''))
    const c = clientLog.instances[0]

    act(() => unmount())
    expect(c.deactivateCount).toBe(1)
  })
})

describe('useGame message routing into state', () => {
  it('applies room frames and keeps a stable identity for timer-only ticks', () => {
    const { result } = renderHook(() => useGame('ABC123'))
    act(() => result.current.connect(''))
    const c = clientLog.instances[0]

    emit(c, '/topic/room/ABC123', roomPayload())
    const roomRef = result.current.room
    expect(result.current.timer).toEqual({ phase: 'LOBBY', remainingTimeSeconds: 90 })

    // Per-second timer ticks must NOT re-render the whole room state.
    emit(c, '/topic/room/ABC123/timer', { phase: 'DISCUSSION', remainingTimeSeconds: 47 })
    expect(result.current.timer).toEqual({ phase: 'DISCUSSION', remainingTimeSeconds: 47 })
    expect(result.current.room).toBe(roomRef)
  })

  it('drops malformed frames without throwing', () => {
    const { result } = renderHook(() => useGame('ABC123'))
    act(() => result.current.connect(''))
    const c = clientLog.instances[0]

    expect(() => {
      act(() => c.subs['/topic/room/ABC123']({ body: '{broken' }))
    }).not.toThrow()
    expect(result.current.room).toBeNull()

    expect(() => {
      act(() => c.subs['/topic/room/ABC123/chat']({ body: 'null' }))
    }).not.toThrow()
    expect(result.current.messages).toEqual([])
  })

  it('appends chat messages with stable ids and stays bounded', () => {
    const { result } = renderHook(() => useGame('ABC123'))
    act(() => result.current.connect(''))
    const c = clientLog.instances[0]

    for (let i = 0; i < 3; i++) {
      emit(c, '/topic/room/ABC123/chat', { senderId: `p${i}`, senderName: `N${i}`, content: `msg ${i}` })
    }
    expect(result.current.messages).toHaveLength(3)
    expect(result.current.messages.map((m) => m.id).every(Boolean)).toBe(true)

    // Bound: 500 public messages.
    for (let i = 3; i < 520; i++) {
      emit(c, '/topic/room/ABC123/chat', { senderId: 'x', senderName: 'x', content: `m${i}` })
    }
    expect(result.current.messages.length).toBe(500)
  })

  it('routes DMs into per-partner bounded lists', () => {
    const { result } = renderHook(() => useGame('ABC123'))
    act(() => result.current.connect(''))
    const c = clientLog.instances[0]

    emit(c, PRIVATE_TOPIC('test-key'), {
      type: 'DM',
      withId: 'player-2',
      message: { senderId: 'player-2', senderName: 'JINA', content: 'psst' },
    })
    expect(result.current.dmMessages['player-2']).toHaveLength(1)
    expect(result.current.dmMessages['player-2'][0].id).toBeTruthy()
  })

  it('forwards SIGNAL frames to the peer manager', () => {
    const { result } = renderHook(() => useGame('ABC123'))
    act(() => result.current.connect(''))
    const c = clientLog.instances[0]
    const mesh = clientLog.peerManagers[0]

    emit(c, PRIVATE_TOPIC('test-key'), { type: 'SIGNAL', fromId: 'player-2', signal: { sdp: 'x' } })
    expect(mesh.handleSignal).toHaveBeenCalledWith('player-2', { sdp: 'x' })
  })

  it('surfaces ACTION_REJECTED as a transient actionError', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGame('ABC123'))
    act(() => result.current.connect(''))
    const c = clientLog.instances[0]

    emit(c, PRIVATE_TOPIC('test-key'), { type: 'ACTION_REJECTED', action: 'VOTE', reason: 'already voted' })
    expect(result.current.actionError).toEqual({ action: 'VOTE', reason: 'already voted' })

    act(() => { vi.advanceTimersByTime(6000) })
    expect(result.current.actionError).toBeNull()
    vi.useRealTimers()
  })
})

describe('useGame actions', () => {
  it('publishes room actions scoped to the current room', () => {
    const { result } = renderHook(() => useGame('ABC123'))
    act(() => result.current.connect(''))
    act(() => result.current.sendMessage('hello'))
    act(() => result.current.vote('player-2'))
    act(() => result.current.scan('player-2'))
    act(() => result.current.protect('player-2'))
    act(() => result.current.doctorCheck('player-2'))
    act(() => result.current.kill('player-2'))
    const c = clientLog.instances[0]

    const destinations = c.published.map((p) => p.destination)
    expect(destinations).toContain('/app/room/ABC123/chat')
    expect(destinations).toContain('/app/room/ABC123/vote')
    expect(destinations).toContain('/app/room/ABC123/scan')
    expect(destinations).toContain('/app/room/ABC123/protect')
    expect(destinations).toContain('/app/room/ABC123/doctorCheck')
    expect(destinations).toContain('/app/room/ABC123/kill')
  })

  it('publishes room creation without an established room code', () => {
    const { result } = renderHook(() => useGame(''))
    act(() => result.current.connect('1234'))
    act(() => result.current.createRoom('ABC123', 6, '1234'))
    const c = clientLog.instances[0]

    const created = c.published.find((p) => p.destination === '/app/room/create')
    expect(created).toBeTruthy()
    expect(JSON.parse(created.body)).toEqual({
      playerId: 'player-1',
      channelKey: 'test-key',
      roomCode: 'ABC123',
      participants: 6,
      pin: '1234',
    })
  })

  it('sends DMs and gnosia chat to the room-scoped destinations', () => {
    const { result } = renderHook(() => useGame('ABC123'))
    act(() => result.current.connect(''))
    act(() => result.current.sendDm('player-2', 'secret'))
    act(() => result.current.sendGnosiaChat('the plan'))
    const c = clientLog.instances[0]

    const dm = c.published.find((p) => p.destination === '/app/room/ABC123/dm')
    expect(dm).toBeTruthy()
    expect(JSON.parse(dm.body)).toEqual({ senderId: 'player-1', targetId: 'player-2', content: 'secret' })

    const gc = c.published.find((p) => p.destination === '/app/room/ABC123/gnosia-chat')
    expect(JSON.parse(gc.body)).toEqual({ senderId: 'player-1', content: 'the plan' })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})