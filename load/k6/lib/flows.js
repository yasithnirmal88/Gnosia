// High-level STOMP flows used by the load scenarios. Every function runs inside
// a k6 ws.connect(socket) callback; k6's socket.setTimeout/setInterval drive the
// async steps. Mirrors the real frontend's message sequence (useGame.ts).
import { subscribeFrame, sendFrame, disconnectFrame, connectFrame, randomHex } from './stomp.js'
import { attach, waitFor, satisfy, frameIs } from './session.js'

export const ROOM_TOPICS = (code) => [
  `/topic/room/${code}`,
  `/topic/room/${code}/timer`,
  `/topic/room/${code}/chat`,
  `/topic/room/${code}/events`,
]

export function openSession(socket) {
  const conn = { socket }
  attach(conn, (c, frame) => satisfy(c, frame))
  socket.send(connectFrame())
  return conn
}

export function subscribePrivate(conn, channelKey) {
  conn.socket.send(subscribeFrame('priv', `/topic/private/${channelKey}`))
}

export function subscribeRoom(conn, code) {
  ROOM_TOPICS(code).forEach((dest, i) => conn.socket.send(subscribeFrame(`room-${i}`, dest)))
}

// Leader path: create a room, then join it as its first player.
// onReady(roomCode) fires after the room-state broadcast round-trips.
export function createRoomAndReady(conn, { channelKey, playerId, roomCode, pin, participants }, onReady, onTimeout, opts = {}) {
  const t0 = Date.now()
  subscribePrivate(conn, channelKey)
  conn.socket.send(sendFrame('/app/room/create', {
    playerId, channelKey, roomCode, participants, pin,
  }))

  waitFor(conn, frameIs(`/topic/private/${channelKey}`, 'ROOM_CREATED'), opts.timeout || 5000,
    (frame) => {
      const code = frame.body.roomCode
      if (opts.metrics) opts.metrics.createLatency.add(Date.now() - t0)
      subscribeRoom(conn, code)
      conn.socket.send(sendFrame(`/app/room/${code}/join`, { id: playerId, channelKey, pin }))
      waitFor(conn, frameIs(`/topic/private/${channelKey}`, 'JOIN_CONFIRMED'), opts.timeout || 5000,
        () => waitFor(conn, frameIs(`/topic/room/${code}`, undefined), opts.timeout || 3000,
          () => { if (opts.metrics) opts.metrics.roomReady.add(Date.now() - t0); onReady(code) },
          () => onReady(code)),
        () => onTimeout && onTimeout('join-confirm'))
    },
    () => onTimeout && onTimeout('room-created'))
}

// Follower path: join an existing room, retrying until the leader has created
// it (join-with-retry, since k6 VUs cannot share JS state).
export function joinRoomWithRetry(conn, { channelKey, playerId, code, pin }, onReady, onTimeout, opts = {}) {
  const t0 = Date.now()
  subscribePrivate(conn, channelKey)
  subscribeRoom(conn, code)

  const attempt = (left) => {
    conn.socket.send(sendFrame(`/app/room/${code}/join`, { id: playerId, channelKey, pin }))
    waitFor(conn,
      (c, fr) => frameIs(`/topic/private/${channelKey}`, 'JOIN_CONFIRMED')(c, fr) || frameIs(`/topic/private/${channelKey}`, 'JOIN_ERROR')(c, fr),
      400,
      (frame) => {
        if (frame.body.type === 'JOIN_CONFIRMED') {
          if (opts.metrics) opts.metrics.joinLatency.add(Date.now() - t0)
          waitFor(conn, frameIs(`/topic/room/${code}`, undefined), 3000,
            () => onReady(code), () => onReady(code))
        } else if (left > 0) {
          conn.socket.setTimeout(() => attempt(left - 1), 250)
        } else {
          onTimeout && onTimeout(`join-error:${frame.body.message}`)
        }
      },
      () => onTimeout && onTimeout('join-echo-timeout'))
  }
  attempt(opts.retries || 60)
}

// Fire a public chat message and measure how long until our own echo returns.
export function chatEcho(conn, code, senderId, senderName, content) {
  const t0 = Date.now()
  conn.socket.send(sendFrame(`/app/room/${code}/chat`, { senderId, senderName, content }))
  waitFor(conn, (c, fr) =>
    fr.headers.destination === `/topic/room/${code}/chat` && fr.body && fr.body.senderId === senderId,
    conn.echoTimeout || 4000,
    () => { if (conn.echoMetric) conn.echoMetric.add(Date.now() - t0) },
    () => { if (conn.echoTimeoutMetric) conn.echoTimeoutMetric.add(1) })
}

export function closeSession(conn) {
  try { conn.socket.send(disconnectFrame()) } catch (e) { /* already closed */ }
  conn.socket.close()
}

export const uniquePin = () => String(1000 + Math.floor(Math.random() * 9000))

// Deterministic shared-room assignment so VUs fill groups without coordination.
export function groupRoomCode(vu, groupSize) {
  const group = Math.floor((vu - 1) / groupSize) + 1
  return `L${String(group).padStart(5, '0')}`
}

export const isLeader = (vu, groupSize) => ((vu - 1) % groupSize) === 0

export const contentBlob = (bytes) => {
  const seed = randomHex(32)
  let out = seed
  while (out.length < bytes) out += seed
  return out.slice(0, bytes)
}