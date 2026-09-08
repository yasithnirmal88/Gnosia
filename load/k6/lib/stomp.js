// Minimal STOMP 1.2 client helpers for the k6 raw-WebSocket harness.
// The backend registers /game-ws-raw (no SockJS) with /app as the
// application destination prefix; server replies come on /topic/...

export const STOMP_NULL = '\u0000'

export function connectFrame() {
  return `CONNECT\naccept-version:1.2\nheart-beat:4000,4000\n\n${STOMP_NULL}`
}

export function subscribeFrame(id, destination) {
  return `SUBSCRIBE\nid:${id}\ndestination:${destination}\n\n${STOMP_NULL}`
}

export function sendFrame(destination, payload) {
  const body = JSON.stringify(payload)
  return `SEND\ndestination:${destination}\ncontent-length:${body.length}\n\n${body}${STOMP_NULL}`
}

export function disconnectFrame() {
  return `DISCONNECT\nreceipt:bye\n\n${STOMP_NULL}`
}

// Incremental frame splitter. Raw STOMP frames are \0-delimited UTF-8 strings.
// Returns an array of complete frame bodies and keeps the trailing partial.
export function makeSplitter() {
  let buffer = ''
  return function split(chunk) {
    buffer += chunk
    const parts = buffer.split(STOMP_NULL)
    buffer = parts.pop() || ''
    return parts
  }
}

// Parse a raw STOMP frame body (headers + payload) into { command, headers, body }.
export function parseFrame(raw) {
  const idx = raw.indexOf('\n\n')
  if (idx === -1) return { command: null, headers: {}, body: '' }
  const [commandLine, headerBlock] = [raw.slice(0, idx), raw.slice(idx + 2)]
  const headerLines = headerBlock.split('\n').filter(Boolean)
  const headers = {}
  for (const line of headerLines) {
    const eq = line.indexOf(':')
    if (eq > 0) headers[line.slice(0, eq)] = line.slice(eq + 1)
  }
  return { command: commandLine, headers, body: JSON.parse(bodyOrEmpty(raw, idx)) }
}

function bodyOrEmpty(raw, idx) {
  const rest = raw.slice(idx + 2)
  const nl = rest.indexOf('\n')
  return nl === -1 ? '' : rest.slice(nl + 1)
}

export function randomHex(len) {
  let out = ''
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 16).toString(16)
  return out
}

export function randomPlayerId(__VU, __ITER) {
  // Unique _and_ valid (isValidPlayerId allows [a-zA-Z0-9-]).
  return `load-${__VU}-${__ITER}-${randomHex(12)}`
}

export function randomChannelKey(__VU, __ITER) {
  return `load-key-${__VU}-${__ITER}-${randomHex(10)}`
}

export function roomCodeFrom(__VU, __ITER) {
  // Upper alnum, 6 chars, mirrors the ROOM_CODE_PATTERN [A-Z0-9]{4,6}.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = `L${__VU}`
  while (code.length < 6) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}