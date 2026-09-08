// Profile: CPU saturation. High-rate connection churn with bursty chat in
// per-VU private rooms. Distinguishes broker/broadcast CPU from per-frame JSON
// serialization (deep-dive in serialization.js).
import { sleep } from 'k6'
import ws from 'k6/ws'
import { Trend, Counter } from 'k6/metrics'
import {
  openSession, createRoomAndReady, chatEcho, closeSession, uniquePin,
} from '../lib/flows.js'
import { contentBlob } from '../lib/flows.js'
import { randomHex, randomPlayerId, randomChannelKey, roomCodeFrom } from '../lib/stomp.js'

const createLatency = new Trend('create_latency_ms', true)
const echoLatency = new Trend('echo_latency_ms', true)
const crashes = new Counter('page_crash_errors')

export const options = {
  scenarios: {
    cpu: {
      executor: 'constant-arrival-rate',
      rate: __ENV.RATE ? Number(__ENV.RATE) : 10, // new connections per second
      timeUnit: '1s',
      duration: __ENV.DURATION || '90s',
      preAllocatedVUs: 40,
      maxVUs: 400,
    },
  },
  thresholds: {
    'create_latency_ms': ['p(95)<2000'],
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
    conn.echoMetric = echoLatency
    conn.echoTimeoutMetric = crashes
    const started = Date.now()

    createRoomAndReady(conn, {
      channelKey, playerId, roomCode, pin, participants: 5,
    }, () => {
      // 300ms burst of 4KB chat before tearing the VU down.
      const burst = () => {
        if (Date.now() - started < 1000) {
          chatEcho(conn, roomCode, playerId, 'LOAD', contentBlob(4096))
          socket.setTimeout(burst, 250)
        } else {
          closeSession(conn)
        }
      }
      socket.setTimeout(burst, 30)
    }, (why) => { crashes.add(1, { reason: why }); conn.socket.close() },
    { metrics: { createLatency } })
  })
  sleep(0.2)
}