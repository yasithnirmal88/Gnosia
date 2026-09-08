// Profile: end-to-end latency. Echo round-trip (SEND /chat → MESSAGE /topic/.../chat)
// measured against a pooled set of 15-player rooms. k6's socket timers give
// millisecond resolution; thresholds guard the interactive p95 budget.
import { sleep } from 'k6'
import ws from 'k6/ws'
import { Trend, Counter } from 'k6/metrics'
import {
  openSession, createRoomAndReady, joinRoomWithRetry, chatEcho, closeSession,
  groupRoomCode, isLeader, uniquePin,
} from '../lib/flows.js'
import { option } from './_shared.js'

const echoLatency = new Trend('echo_latency_ms', true)
const timeoutCount = new Counter('echo_timeout')

export const options = {
  scenarios: {
    latency: {
      executor: 'constant-vus',
      vus: __ENV.VUS ? Number(__ENV.VUS) : 15,
      duration: __ENV.DURATION || '60s',
    },
  },
  thresholds: {
    'echo_latency_ms': ['p(50)<300', 'p(95)<800', 'p(99)<1500'],
    'echo_timeout': ['count==0'],
  },
}

const BASE_URL = __ENV.URL || 'ws://127.0.0.1:8080/game-ws-raw'

export default function () {
  const vu = __VU
  const iter = __ITER
  const code = groupRoomCode(vu, option.groupSize)
  const channelKey = `lt-key-${vu}-${iter}-${Math.random().toString(16).slice(2, 12)}`
  const playerId = `load-${vu}-${iter}-${Math.random().toString(16).slice(2, 14)}`
  const pin = uniquePin()

  ws.connect(BASE_URL, {}, (socket) => {
    const conn = openSession(socket)
    conn.echoMetric = echoLatency
    conn.echoTimeoutMetric = timeoutCount
    const started = Date.now()

    const onReady = () => {
      const probe = () => {
        if (Date.now() - started < (__ENV.DURATION_MS ? Number(__ENV.DURATION_MS) : 45000)) {
          chatEcho(conn, code, playerId, 'LOAD', 'latency-probe')
          socket.setTimeout(probe, 200)
        } else {
          closeSession(conn)
        }
      }
      socket.setTimeout(probe, 40)
    }

    if (isLeader(vu, option.groupSize)) {
      createRoomAndReady(conn, {
        channelKey, playerId, roomCode: code, pin, participants: option.groupSize,
      }, onReady, () => conn.socket.close(), { timeout: 8000 })
    } else {
      joinRoomWithRetry(conn, { channelKey, playerId, code, pin }, onReady,
        () => conn.socket.close(), { retries: 120 })
    }
  })
  sleep(0)
}