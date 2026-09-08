// Profile: server memory under sustained load. A fixed pool of long-lived VUs
// stays connected (heartbeat+idle) while a low rate of create/join churn
// exercises room lifecycle, identity release, and retention sweep paths.
// Memory is observed out-of-band (k6 does not sample server RSS); this script
// is the sustained baseline that the OTel/JMX monitoring in TESTING.md pairs with.
import { sleep } from 'k6'
import ws from 'k6/ws'
import { Counter } from 'k6/metrics'
import {
  openSession, createRoomAndReady, closeSession, uniquePin,
} from '../lib/flows.js'
import { randomHex, randomPlayerId, randomChannelKey, roomCodeFrom } from '../lib/stomp.js'

const churnOk = new Counter('churn_ok')
const churnErr = new Counter('churn_err')

export const options = {
  scenarios: {
    carry: {
      executor: 'constant-vus',
      vus: __ENV.VUS ? Number(__ENV.VUS) : 60,
      duration: __ENV.DURATION || '3m',
    },
  },
  thresholds: {
    'churn_err': ['count==0'],
  },
}

const BASE_URL = __ENV.URL || 'ws://127.0.0.1:8080/game-ws-raw'

export default function () {
  const vu = __VU

  // Per-iteration churn: a short-lived creator room, torn down immediately.
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
      churnOk.add(1)
      closeSession(conn)
    }, (why) => { churnErr.add(1, { reason: why }); conn.socket.close() })
  })
  sleep(3)
}