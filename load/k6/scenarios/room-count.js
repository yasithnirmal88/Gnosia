// Profile: total concurrent rooms. Each VU creates a distinct room and holds it
// open (a real browser would keep the tab on the lobby), growing the room table
// until empty/abandoned sweep reclaims it. Baselines how many live room
// GameTasks the scheduler + broadcaster can hold.
import { sleep } from 'k6'
import ws from 'k6/ws'
import { Trend, Counter } from 'k6/metrics'
import {
  openSession, createRoomAndReady, closeSession, uniquePin,
} from '../lib/flows.js'
import { randomHex, randomPlayerId, randomChannelKey, roomCodeFrom } from '../lib/stomp.js'

const createLatency = new Trend('create_latency_ms', true)
const created = new Counter('rooms_created')
const failed = new Counter('rooms_failed')
const released = new Counter('rooms_released')

export const options = {
  scenarios: {
    rooms: {
      executor: 'constant-arrival-rate',
      rate: __ENV.RATE ? Number(__ENV.RATE) : 2, // new rooms per second
      timeUnit: '1s',
      duration: __ENV.DURATION || '120s',
      preAllocatedVUs: 20,
      maxVUs: 300,
    },
  },
  thresholds: {
    'rooms_failed': ['count==0'],
    'rooms_released': [(k) => k > 0], // retention sweep must reclaim rooms
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

  ws.connect(BASE_URL, {}, (socket) => {
    const conn = openSession(socket)
    createRoomAndReady(conn, {
      channelKey, playerId, roomCode, pin, participants: 5,
    }, () => {
      created.add(1)
      // Hold the room for the connected window, then abandon it.
      conn.socket.setTimeout(() => {
        released.add(1)
        closeSession(conn)
      }, 15000)
    }, (why) => { failed.add(1, { reason: why }); conn.socket.close() },
    { metrics: { createLatency } })
  })
  sleep(0.2)
}