/**
 * Robust message handling layer.
 *
 * STOMP frames arrive as opaque strings. This module separates the concerns:
 *
 *   STOMP frame body
 *        ↓  safeParse          (never throws — malformed JSON is dropped)
 *        ↓  schema validation  (per-topic / per-type)
 *        ↓  routing            (dispatches only valid, expected shapes)
 *        ↓  React state        (handlers wired in useGame, below the router)
 *
 * The router is pure and framework-free so it is unit-testable in Node/jsdom.
 * Malformed or unanticipated server data never flows into React state and can
 * never crash the UI.
 */

// ─── Safe parse ───────────────────────────────────────────────────────────────

export const safeParse = (body) => {
  if (typeof body !== 'string' || body.trim() === '') {
    return { ok: false, reason: 'empty-body' };
  }
  try {
    return { ok: true, data: JSON.parse(body) };
  } catch {
    return { ok: false, reason: 'bad-json' };
  }
};

// ─── Primitives ───────────────────────────────────────────────────────────────

const isStr = (v) => typeof v === 'string';
const isNonEmptyStr = (v) => isStr(v) && v.length > 0;
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const isPlayer = (p) =>
  isPlainObject(p) &&
  isNonEmptyStr(p.id) &&
  isNonEmptyStr(p.name) &&
  (typeof p.alive === 'boolean' || p.alive === undefined);

export const isRoom = (r) =>
  isPlainObject(r) &&
  isNonEmptyStr(r.roomCode) &&
  Array.isArray(r.players) &&
  r.players.every(isPlayer) &&
  isPlainObject(r.gameState);

export const isTimerUpdate = (t) =>
  isPlainObject(t) &&
  isNonEmptyStr(t.phase) &&
  isFiniteNumber(t.remainingTimeSeconds);

export const isChatMessage = (m) =>
  isPlainObject(m) &&
  isNonEmptyStr(m.senderId) &&
  isStr(m.senderName) &&
  isStr(m.content);

export const isSignal = (s) =>
  isPlainObject(s) &&
  isNonEmptyStr(s.fromId) &&
  isPlainObject(s.signal);

// ─── Stable client-side ids ───────────────────────────────────────────────────

let messageSeq = 0;
/** React keys must be stable. Server chat/DM frames have no id; stamp one. */
export const stampId = (msg) => {
  if (!isPlainObject(msg)) return msg;
  if (isNonEmptyStr(msg.id)) return msg;
  return { ...msg, id: `${++messageSeq}-${msg.senderId || 'anon'}-${Date.now()}` };
};

// ─── Warn-once helper (log noise guard) ───────────────────────────────────────

const warnedKeys = new Set();
const warnOnce = (key, detail) => {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  console.warn(`[ws] Dropped malformed frame (${key})`, detail ?? '');
};

// ─── Router ───────────────────────────────────────────────────────────────────

/**
 * @param {Object} handlers  — every handler is optional. Invalid frames are
 *   dropped before any handler runs, so a handler can assume a valid payload.
 */
export const makeRouter = (handlers) => {
  const h = handlers || {};

  const routePrivate = (data, body) => {
    if (!isPlainObject(data) || !isNonEmptyStr(data.type)) {
      warnOnce(`private:${body?.substring(0, 40)}`, 'missing type');
      return;
    }
    switch (data.type) {
      case 'ROOM_CREATED':
        if (isNonEmptyStr(data.roomCode)) h.onRoomCreated?.(data.roomCode);
        else warnOnce('private:ROOM_CREATED', 'bad roomCode');
        break;
      case 'PRIVATE_INFO':
        if (isPlainObject(data) && isStr(data.role)) h.onPrivateInfo?.(data);
        else warnOnce('private:PRIVATE_INFO', 'bad payload');
        break;
      case 'SCAN_RESULT':
        h.onScanResult?.(data);
        break;
      case 'DOCTOR_CHECK_RESULT':
        h.onDoctorResult?.(data);
        break;
      case 'JOIN_ERROR':
        if (isStr(data.message)) h.onJoinError?.(data.message);
        else warnOnce('private:JOIN_ERROR', 'bad message');
        break;
      case 'ACTION_REJECTED':
        if (isStr(data.action) && isStr(data.reason)) h.onActionRejected?.({ action: data.action, reason: data.reason });
        else warnOnce('private:ACTION_REJECTED', 'bad payload');
        break;
      case 'GNOSIA_CHAT':
        if (isChatMessage(data.message)) h.onGnosiaChat?.(stampId(data.message));
        else warnOnce('private:GNOSIA_CHAT', 'bad message');
        break;
      case 'DM':
        if (isChatMessage(data.message) && isNonEmptyStr(data.withId)) {
          h.onDm?.({ withId: data.withId, message: stampId(data.message) });
        } else {
          warnOnce('private:DM', 'bad payload');
        }
        break;
      case 'SIGNAL':
        if (isSignal(data)) h.onSignal?.({ fromId: data.fromId, signal: data.signal });
        else warnOnce('private:SIGNAL', 'bad payload');
        break;
      default:
        // Unknown private message types are ignored, never crash.
        warnOnce(`private:${data.type}`, 'unknown type');
        break;
    }
  };

  const routeTopics = {
    room: (data) => {
      if (isRoom(data)) h.onRoom?.(data);
      else warnOnce('room', 'not a valid room payload');
    },
    timer: (data) => {
      if (isTimerUpdate(data)) h.onTimer?.({ phase: data.phase, remainingTimeSeconds: data.remainingTimeSeconds });
      else warnOnce('timer', 'not a valid timer payload');
    },
    chat: (data) => {
      if (isChatMessage(data)) h.onChat?.(stampId(data));
      else warnOnce('chat', 'not a valid chat message');
    },
    events: (data) => {
      if (isPlainObject(data)) h.onEvent?.(data);
      else warnOnce('events', 'not an object');
    },
  };

  /**
   * @param {string} topic  one of 'room' | 'timer' | 'chat' | 'events' | 'private'
   * @param {string} body   raw STOMP frame body.
   */
  const route = (topic, body) => {
    const parsed = safeParse(body);
    if (!parsed.ok) {
      warnOnce(`${topic}:${body?.substring(0, 40)}`, parsed.reason);
      return;
    }
    if (topic === 'private') {
      routePrivate(parsed.data, body);
    } else {
      routeTopics[topic]?.(parsed.data);
    }
  };

  return { route };
};

export default makeRouter;