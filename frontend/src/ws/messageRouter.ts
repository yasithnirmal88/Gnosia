/**
 * Robust message handling layer (TypeScript).
 *
 * STOMP frames arrive as opaque strings. This module separates the concerns:
 *
 *   STOMP frame body
 *        ↓  safeParse          (never throws — malformed JSON is dropped)
 *        ↓  zod schema         (per-topic / per-type; see types/schemas)
 *        ↓  routing            (dispatches only valid, expected shapes)
 *        ↓  React state        (handlers wired in useGame, below the router)
 *
 * The router is pure and framework-free so it is unit-testable in Node/jsdom.
 * Malformed or unanticipated server data never flows into React state and can
 * never crash the UI. Every accepted frame is typed by the shared schemas.
 */
import type { ChatMessage, PublicMessage, Room } from '../types/contracts';
import {
  chatMessageSchema,
  gameEventSchema,
  privateFrameSchema,
  roomSchema,
  timerUpdateSchema,
  type DoctorResultFrame,
  type GameEvent,
  type PrivateInfoFrame,
  type ScanResultFrame,
} from '../types/schemas';
import type { ActionError, ServerTopic, TimerTick } from '../types/ws';

// ─── Safe parse ───────────────────────────────────────────────────────────────

export type ParseResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: string };

export const safeParse = (body: unknown): ParseResult => {
  if (typeof body !== 'string' || body.trim() === '') {
    return { ok: false, reason: 'empty-body' };
  }
  try {
    return { ok: true, data: JSON.parse(body) as unknown };
  } catch {
    return { ok: false, reason: 'bad-json' };
  }
};

// ─── Primitives ───────────────────────────────────────────────────────────────

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const isNonEmptyStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

// ─── Stable client-side ids ───────────────────────────────────────────────────

let messageSeq = 0;

/**
 * React keys must be stable. Server chat/DM frames have no id; stamp one that
 * is unique per tab. An id the server (or a previous stamp) already provided
 * is kept untouched.
 */
export const stampId = (msg: ChatMessage & { id?: string }): PublicMessage => {
  if (isNonEmptyStr(msg.id)) return msg as PublicMessage;
  return { ...msg, id: `${++messageSeq}-${msg.senderId || 'anon'}-${Date.now()}` };
};

// ─── Warn-once helper (log noise guard) ───────────────────────────────────────

const warnedKeys = new Set<string>();
const warnOnce = (key: string, detail: string) => {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  console.warn(`[ws] Dropped malformed frame (${key})`, detail || '');
};

const preview = (body: unknown): string =>
  typeof body === 'string' ? body.substring(0, 40) : '';

// ─── Router ───────────────────────────────────────────────────────────────────

/**
 * Every handler is optional. Invalid frames are dropped before any handler
 * runs, so a handler can assume a valid, schema-checked payload.
 */
export interface MessageHandlers {
  onRoom?: (room: Room) => void;
  onTimer?: (tick: TimerTick) => void;
  onChat?: (msg: PublicMessage) => void;
  onEvent?: (event: GameEvent) => void;
  onRoomCreated?: (roomCode: string) => void;
  onPrivateInfo?: (info: PrivateInfoFrame) => void;
  onScanResult?: (result: ScanResultFrame) => void;
  onDoctorResult?: (result: DoctorResultFrame) => void;
  onJoinError?: (message: string) => void;
  onActionRejected?: (error: ActionError) => void;
  onGnosiaChat?: (msg: PublicMessage) => void;
  onDm?: (payload: { withId: string; message: PublicMessage }) => void;
  onSignal?: (payload: { fromId: string; signal: Record<string, unknown> }) => void;
}

type RoomTopic = Exclude<ServerTopic, 'private'>;

export const makeRouter = (handlers?: MessageHandlers) => {
  const h: MessageHandlers = handlers ?? {};

  const routePrivate = (data: unknown) => {
    const parsed = privateFrameSchema.safeParse(data);
    if (!parsed.success) {
      warnOnce(`private:${isPlainObject(data) ? 'frame' : 'non-object'}`, 'not a recognized private frame');
      return;
    }
    const frame = parsed.data;
    switch (frame.type) {
      case 'ROOM_CREATED':
        h.onRoomCreated?.(frame.roomCode);
        break;
      case 'JOIN_CONFIRMED':
        // Informational ack; surface it if a handler ever wants it.
        break;
      case 'JOIN_ERROR':
        h.onJoinError?.(frame.message);
        break;
      case 'PRIVATE_INFO':
        h.onPrivateInfo?.(frame);
        break;
      case 'SCAN_RESULT':
        h.onScanResult?.(frame);
        break;
      case 'DOCTOR_CHECK_RESULT':
        h.onDoctorResult?.(frame);
        break;
      case 'ACTION_REJECTED':
        h.onActionRejected?.({ action: frame.action, reason: frame.reason });
        break;
      case 'GNOSIA_CHAT':
        h.onGnosiaChat?.(stampId(frame.message));
        break;
      case 'DM':
        h.onDm?.({ withId: frame.withId, message: stampId(frame.message) });
        break;
      case 'SIGNAL':
        h.onSignal?.({ fromId: frame.fromId, signal: frame.signal });
        break;
    }
  };

  const routeTopics: Record<RoomTopic, (data: unknown) => void> = {
    room: (data) => {
      const parsed = roomSchema.safeParse(data);
      if (!parsed.success) {
        warnOnce('room', 'not a valid room payload');
        return;
      }
      h.onRoom?.(parsed.data);
    },
    timer: (data) => {
      const parsed = timerUpdateSchema.safeParse(data);
      if (!parsed.success) {
        warnOnce('timer', 'not a valid timer payload');
        return;
      }
      h.onTimer?.({
        phase: parsed.data.phase,
        remainingTimeSeconds: parsed.data.remainingTimeSeconds,
      });
    },
    chat: (data) => {
      const parsed = chatMessageSchema.safeParse(data);
      if (!parsed.success) {
        warnOnce('chat', 'not a valid chat message');
        return;
      }
      h.onChat?.(stampId(parsed.data));
    },
    events: (data) => {
      const parsed = gameEventSchema.safeParse(data);
      if (!parsed.success) {
        warnOnce('events', 'not an object');
        return;
      }
      h.onEvent?.(parsed.data);
    },
  };

  /**
   * @param topic one of 'room' | 'timer' | 'chat' | 'events' | 'private'
   * @param body  raw STOMP frame body.
   */
  const route = (topic: ServerTopic, body: unknown) => {
    const parsed = safeParse(body);
    if (!parsed.ok) {
      warnOnce(`${topic}:${preview(body)}`, parsed.reason);
      return;
    }
    if (topic === 'private') {
      routePrivate(parsed.data);
    } else {
      routeTopics[topic](parsed.data);
    }
  };

  return { route };
};

export default makeRouter;