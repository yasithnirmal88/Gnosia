// Shared STOMP session state machine for k6 load VUs.
// Each k6 VU runs in an isolated JS runtime, so all coordination happens within
// a single WebSocket connection; cross-VU room setup uses deterministic codes
// plus join-with-retry (see scenarios).
import { makeSplitter, parseFrame } from './stomp.js'

// Wire an onmessage handler that splits raw frames and dispatches parsed ones.
export function attach(conn, onMessage) {
  conn.splitter = makeSplitter()
  conn.waiters = []
  conn.socket.onmessage = (event) => {
    for (const raw of conn.splitter(event.data.toString())) {
      const frame = parseFrame(raw)
      if (!frame.command) continue
      onMessage(conn, frame)
    }
  }
}

// Wait until `pred(conn, frame)` is true for some incoming frame. `onReady` is
// invoked with that frame (or the latest frame text for latency timing).
// Times out after `deadlineMs`, invoking `onTimeout` and leaving the waiter dead.
export function waitFor(conn, pred, deadlineMs, onReady, onTimeout) {
  const waiter = { pred, onReady, onTimeout, done: false }
  conn.waiters.push(waiter)
  conn.socket.setTimeout(() => {
    if (waiter.done) return
    waiter.done = true
    if (onTimeout) onTimeout(waiter)
  }, deadlineMs)
}

// Feed a freshly-arrived frame to every pending waiter (call from onMessage).
export function satisfy(conn, frame) {
  for (const w of conn.waiters) {
    if (w.done) continue
    if (w.pred(conn, frame)) {
      w.done = true
      w.onReady(frame)
    }
  }
}

// ─── Reusable predicates ──────────────────────────────────────────────────────

export const frameIs = (dest, type) => (conn, frame) =>
  frame.headers.destination === dest &&
  (type === undefined || (frame.body && frame.body.type === type))