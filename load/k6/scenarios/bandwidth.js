// Profile: public-chat message throughput. Each VU joins a deterministically
// assigned 15-player room (leader creates it, followers join-with-retry) and
// pumps chat messages through the STOMP broker for the whole test duration.
import { sleep } from 'k6'
import ws from 'k6/ws'
import { Trend, Counter } from 'k6/metrics'
import {
  openSession, createRoomAndReady, joinRoomWithRetry, chatEcho, closeSession,
  groupRoomCode, isLeader, uniquePin,
} from '../lib/flows.js'
import { option } from './_shared.js'

const chatEchoLatency = new Trend('chat_echo_latency_ms', true)
const echoTimeout = new Counter('chat_echo_timeout')
const dts = new Counter('dt_errors')

export const options = {
  scenarios: {
    chat: {
      executor: 'constant-vus',
      vus: __ENV.VUS ? Number(__ENV.VUS) : 30,
      duration: __ENV.DURATION || '60s',
    },
  },
  thresholds: {
    'chat_echo_latency_ms': ['p(95)<1200'],
    'dt_errors': ['count==0'],
  },
}

const BASE_URL = __ENV.URL || 'ws://127.0.0.1:8080/game-ws-raw'

export default function () {
  const vu = __VU
  const iter = __ITER
  const code = groupRoomCode(vu, option.groupSize)
  const channelKey = `wf-key-${vu}-${iter}-${Math.random().toString(16).slice(2, 12)}`
  const playerId = `load-${vu}-${iter}-${Math.random().toString(16).slice(2, 14)}`
  const pin = uniquePin()

  ws.connect(BASE_URL, {}, (socket) => {
    const conn = openSession(socket)
    conn.echoMetric = chatEchoLatency
    conn.echoTimeoutMetric = echoTimeout
    const started = Date.now()

    const ready = () => {
      const pump = () => {
        if (Date.now() - started < (__ENV.DURATION_MS ? Number(__ENV.DURATION_MS) : 45000)) {
          chatEcho(conn, code, playerId, 'LOAD', option.blob)
          socket.setTimeout(pump, 150)
        } else {
          closeSession(conn)
        }
      }
      socket.setTimeout(pump, 50)
    }

    if (isLeader(vu, option.groupSize)) {
      createRoomAndReady(conn, {
        channelKey, playerId, roomCode: code, pin, participants: option.groupSize,
      }, ready, () => conn.socket.close(), { timeout: 8000 })
    } else {
      joinRoomWithRetry(conn, { channelKey, playerId, code, pin }, ready,
        (why) => { dts.add(1, { reason: why }); conn.socket.close() }, { retries: 120 })
    }
  })
  sleep(0)
}