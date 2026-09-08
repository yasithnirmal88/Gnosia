// Profile: JSON serialization cost. Same 15-player group structure as
// bandwidth.js, but chat payloads are maximum-size and every join forces a full
// RoomResponse serialize/broadcast to all room subscribers. Pinpoints
// frame-size ceilings and serialization hotspots.
import { sleep } from 'k6'
import ws from 'k6/ws'
import { Trend, Counter } from 'k6/metrics'
import {
  openSession, createRoomAndReady, joinRoomWithRetry, chatEcho, closeSession,
  groupRoomCode, isLeader, uniquePin,
} from '../lib/flows.js'
import { contentBlob } from '../lib/flows.js'
import { option } from './_shared.js'

const echoLatency = new Trend('echo_latency_ms', true)
const dropped = new Counter('serialization_drops')

export const options = {
  scenarios: {
    serialization: {
      executor: 'constant-vus',
      vus: __ENV.VUS ? Number(__ENV.VUS) : 24, // one and a half 15-player rooms
      duration: __ENV.DURATION || '90s',
    },
  },
  thresholds: {
    'serialization_drops': ['count==0'],
  },
}

const BASE_URL = __ENV.URL || 'ws://127.0.0.1:8080/game-ws-raw'

export default function () {
  const vu = __VU
  const iter = __ITER
  const code = groupRoomCode(vu, option.groupSize)
  const channelKey = `sf-key-${vu}-${iter}-${Math.random().toString(16).slice(2, 12)}`
  const playerId = `load-${vu}-${iter}-${Math.random().toString(16).slice(2, 14)}`
  const pin = uniquePin()

  ws.connect(BASE_URL, {}, (socket) => {
    const conn = openSession(socket)
    conn.echoMetric = echoLatency
    conn.echoTimeoutMetric = dropped
    const started = Date.now()

    const onReady = () => {
      const pump = () => {
        if (Date.now() - started < (__ENV.DURATION_MS ? Number(__ENV.DURATION_MS) : 60000)) {
          chatEcho(conn, code, playerId, 'LOAD', contentBlob(option.blobSize))
          socket.setTimeout(pump, 400)
        } else {
          closeSession(conn)
        }
      }
      socket.setTimeout(pump, 40)
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