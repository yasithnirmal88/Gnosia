// Profile: raw connection/room-creation throughput (handshake + STOMP lifecycle).
// Each VU creates a unique room, becomes its first player, and disconnects.
// Exercises SessionIdentityService claiming, room creation, and per-room state
// broadcast under connection churn.
import { sleep } from 'k6'
import ws from 'k6/ws'
import { Trend, Counter } from 'k6/metrics'
import {
  openSession, createRoomAndReady, closeSession, uniquePin,
} from '../lib/flows.js'
import { randomHex, randomPlayerId, randomChannelKey, roomCodeFrom } from '../lib/stomp.js'

const createLatency = new Trend('create_latency_ms', true)
const createOk = new Counter('create_ok')
const createErr = new Counter('create_err')

export const options = {
  scenarios: {
    churn: {
      executor: 'constant-arrival-rate',
      rate: __ENV.RATE ? Number(__ENV.RATE) : 4,
      timeUnit: '1s',
      duration: __ENV.DURATION || '60s',
      preAllocatedVUs: 20,
      maxVUs: 200,
    },
  },
  thresholds: {
    create_err: ['count==0'],
    create_latency_ms: ['p(95)<1500'],
  },
}

const BASE_URL = __ENV.URL || 'ws://127.0.0.1:8080/game-ws-raw'

export default function () {
  const vu = __VU
  const iter = __ITER
  const channelKey = randomChannelKey(vu, iter)
  const playerId = randomPlayerId(vu, iter)
  const roomCode = roomCodeFrom(vu, iter)
  const pin = uniquePin()
  const url = `${BASE_URL}?load=connections`

  ws.connect(url, {}, (socket) => {
    const conn = openSession(socket)
    createRoomAndReady(conn, {
      channelKey, playerId, roomCode, pin, participants: 5,
    }, () => {
      createOk.add(1)
      closeSession(conn)
    }, (why) => {
      createErr.add(1, { reason: why })
      // Close the socket even on timeout so the VU iteration ends promptly.
      conn.socket.close()
    }, { metrics: { createLatency } })
  })
  sleep(1)
}