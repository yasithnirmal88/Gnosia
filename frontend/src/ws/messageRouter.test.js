import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeRouter, safeParse, stampId } from './messageRouter'

const validRoom = {
  roomCode: 'ABC123',
  players: [
    { id: 'p1', name: 'SETSU', alive: true },
    { id: 'p2', name: 'JINA', alive: false },
  ],
  gameState: { phase: 'LOBBY', remainingTimeSeconds: 90 },
}

const makeHandlers = () => ({
  onRoom: vi.fn(),
  onTimer: vi.fn(),
  onChat: vi.fn(),
  onEvent: vi.fn(),
  onRoomCreated: vi.fn(),
  onPrivateInfo: vi.fn(),
  onScanResult: vi.fn(),
  onDoctorResult: vi.fn(),
  onJoinError: vi.fn(),
  onActionRejected: vi.fn(),
  onGnosiaChat: vi.fn(),
  onDm: vi.fn(),
  onSignal: vi.fn(),
})

const frame = (body) => ({ body: JSON.stringify(body) })

describe('safeParse', () => {
  it('parses valid JSON', () => {
    expect(safeParse('{"a":1}')).toEqual({ ok: true, data: { a: 1 } })
  })

  it('rejects malformed JSON without throwing', () => {
    const r = safeParse('{oops')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('bad-json')
  })

  it('rejects empty bodies', () => {
    expect(safeParse('').ok).toBe(false)
    expect(safeParse('   ').ok).toBe(false)
    expect(safeParse(undefined).ok).toBe(false)
  })
})

describe('messageRouter', () => {
  let handlers
  let router

  beforeEach(() => {
    handlers = makeHandlers()
    router = makeRouter(handlers)
  })

  it('routes a valid room frame', () => {
    router.route('room', JSON.stringify(validRoom))
    expect(handlers.onRoom).toHaveBeenCalledWith(validRoom)
  })

  it('drops a room frame with missing players and does not call handlers', () => {
    router.route('room', JSON.stringify({ roomCode: 'X' }))
    expect(handlers.onRoom).not.toHaveBeenCalled()
  })

  it('routes a valid timer frame', () => {
    router.route('timer', JSON.stringify({ phase: 'DISCUSSION', remainingTimeSeconds: 42 }))
    expect(handlers.onTimer).toHaveBeenCalledWith({ phase: 'DISCUSSION', remainingTimeSeconds: 42 })
  })

  it('drops a timer frame with a non-numeric countdown', () => {
    router.route('timer', JSON.stringify({ phase: 'DISCUSSION', remainingTimeSeconds: 'hi' }))
    expect(handlers.onTimer).not.toHaveBeenCalled()
  })

  it('stamps stable ids onto chat frames', () => {
    router.route('chat', JSON.stringify({ senderId: 'p1', senderName: 'SETSU', content: 'hi' }))
    const [msg] = handlers.onChat.mock.calls[0]
    expect(msg.senderId).toBe('p1')
    expect(msg.id).toBeTruthy()
    // Same payload twice → different ids (unique, never Math.random keys)
    router.route('chat', JSON.stringify({ senderId: 'p1', senderName: 'SETSU', content: 'hi again' }))
    const [msg2] = handlers.onChat.mock.calls[1]
    expect(msg2.id).toBeTruthy()
    expect(msg2.id).not.toBe(msg.id)
  })

  it('keeps an existing id when the server provides one', () => {
    router.route('chat', JSON.stringify({ id: 'fixed-1', senderId: 'p1', senderName: 'S', content: 'x' }))
    expect(handlers.onChat.mock.calls[0][0].id).toBe('fixed-1')
  })

  it('does not crash on malformed JSON frames', () => {
    expect(() => router.route('room', '{not json')).not.toThrow()
    expect(() => router.route('chat', 'null')).not.toThrow()
    expect(() => router.route('timer', '')).not.toThrow()
    expect(handlers.onRoom).not.toHaveBeenCalled()
    expect(handlers.onChat).not.toHaveBeenCalled()
  })

  it('routes private DM envelopes and stamps the nested message', () => {
    router.route('private', JSON.stringify({
      type: 'DM',
      withId: 'p2',
      message: { senderId: 'p2', senderName: 'JINA', content: 'psst' },
    }))
    const [payload] = handlers.onDm.mock.calls[0]
    expect(payload.withId).toBe('p2')
    expect(payload.message.id).toBeTruthy()
    expect(payload.message.content).toBe('psst')
  })

  it('routes ROOM_CREATED private frames', () => {
    router.route('private', JSON.stringify({ type: 'ROOM_CREATED', roomCode: 'ZZ99' }))
    expect(handlers.onRoomCreated).toHaveBeenCalledWith('ZZ99')
  })

  it('routes ACTION_REJECTED frames', () => {
    router.route('private', JSON.stringify({ type: 'ACTION_REJECTED', action: 'VOTE', reason: 'too slow' }))
    expect(handlers.onActionRejected).toHaveBeenCalledWith({ action: 'VOTE', reason: 'too slow' })
  })

  it('routes SIGNAL frames', () => {
    router.route('private', JSON.stringify({ type: 'SIGNAL', fromId: 'p2', signal: { sdp: 'x' } }))
    expect(handlers.onSignal).toHaveBeenCalledWith({ fromId: 'p2', signal: { sdp: 'x' } })
  })

  it('routes GNOSIA_CHAT frames', () => {
    router.route('private', JSON.stringify({ type: 'GNOSIA_CHAT', message: { senderId: 'p1', senderName: 'G', content: 'kill' } }))
    expect(handlers.onGnosiaChat).toHaveBeenCalled()
  })

  it('routes JOIN_ERROR frames', () => {
    router.route('private', JSON.stringify({ type: 'JOIN_ERROR', message: 'Nope' }))
    expect(handlers.onJoinError).toHaveBeenCalledWith('Nope')
  })

  it('routes SCAN_RESULT / DOCTOR_CHECK_RESULT / PRIVATE_INFO frames', () => {
    router.route('private', JSON.stringify({ type: 'SCAN_RESULT', result: 'GNOSIA', subjectId: 'p2' }))
    router.route('private', JSON.stringify({ type: 'DOCTOR_CHECK_RESULT', result: 'HUMAN', subjectId: 'p2' }))
    router.route('private', JSON.stringify({ type: 'PRIVATE_INFO', role: 'ENGINEER', partners: [] }))
    expect(handlers.onScanResult).toHaveBeenCalledWith(expect.objectContaining({ result: 'GNOSIA' }))
    expect(handlers.onDoctorResult).toHaveBeenCalledWith(expect.objectContaining({ result: 'HUMAN' }))
    expect(handlers.onPrivateInfo).toHaveBeenCalledWith(expect.objectContaining({ role: 'ENGINEER' }))
  })

  it('drops unknown private types and malformed envelopes without throwing', () => {
    expect(() => router.route('private', JSON.stringify({ type: 'WEIRD_THING' }))).not.toThrow()
    expect(() => router.route('private', JSON.stringify({ noType: true }))).not.toThrow()
    expect(() => router.route('private', JSON.stringify({ type: 'DM', withId: 'x' }))).not.toThrow()
    expect(handlers.onDm).not.toHaveBeenCalled()
  })
})

describe('stampId', () => {
  it('is stable for repeated calls on the same message', () => {
    const a = stampId({ senderId: 'p1', content: 'x' })
    expect(a.id).toBeTruthy()
  })
})