/**
 * Typed WebSocket protocol.
 *
 * ServerEvent is the discriminated union of everything that can arrive on the
 * four room topics plus the private channel. It mirrors the backend controllers:
 *
 *   /topic/room/{code}        → Room          (RoomStateEvent, incl. GAME_OVER)
 *   /topic/room/{code}/timer  → TimerUpdate   (TimerUpdateEvent)
 *   /topic/room/{code}/chat   → ChatMessage   (RoomChatEvent, id-stamped)
 *   /topic/room/{code}/events → GameEvent     (GameAnnouncementEvent)
 *   /topic/private/{key}      → PrivateFrame  (PrivateEvent / SignalEvent)
 *
 * The outbound payloads describe what the client publishes to /app/room/**;
 * note the server derives identity from the authenticated session and ignores
 * the id-ish fields (they are sent for debuggability, never trusted).
 */
import type { Phase, PublicMessage, Room } from './contracts';
import type { GameEvent, PrivateFrame, TimerUpdate } from './schemas';

export const SERVER_TOPICS = ['room', 'timer', 'chat', 'events', 'private'] as const;
export type ServerTopic = (typeof SERVER_TOPICS)[number];

export interface RoomStateEvent {
  topic: 'room';
  data: Room;
}

export interface TimerUpdateEvent {
  topic: 'timer';
  data: TimerUpdate;
}

export interface RoomChatEvent {
  topic: 'chat';
  data: PublicMessage;
}

export interface GameAnnouncementEvent {
  topic: 'events';
  data: GameEvent;
}

export interface PrivateEvent {
  topic: 'private';
  data: PrivateFrame;
}

/** A SIGNAL private frame, narrowed for WebRTC consumers. */
export interface SignalEvent {
  topic: 'private';
  data: PrivateFrame & { type: 'SIGNAL' };
}

/** The end-of-game announcement is just a room frame in phase GAME_OVER. */
export interface GameOverEvent extends RoomStateEvent {}

export type ServerEvent =
  | RoomStateEvent
  | TimerUpdateEvent
  | RoomChatEvent
  | GameAnnouncementEvent
  | PrivateEvent
  | SignalEvent;
// `GameOverEvent` is intentionally not a top-level union member: the server has
// no dedicated frame, so any RoomStateEvent with data.gameState.phase ===
// 'GAME_OVER' is the game-over signal.

/** True when a room frame carries the winning state. */
export const isGameOverRoom = (room: Room): boolean => room.gameState.phase === 'GAME_OVER';

/**
 * The normalized countdown slice (payload of TimerUpdateEvent). `phase` is
 * null before the first room/timer frame so the hook's initial state is honest.
 */
export interface TimerTick {
  phase: Phase | null;
  remainingTimeSeconds: number;
}

/** An AuthorizationService/ACTION_REJECTED denial. */
export interface ActionError {
  action: string;
  reason: string;
}

// ─── Outbound (client → server) ───────────────────────────────────────────────

export interface RoomCreatePayload {
  playerId: string;
  channelKey: string;
  roomCode?: string | null;
  participants: number;
  pin: string;
}

export interface RoomJoinPayload {
  id: string;
  channelKey: string;
  pin: string;
}

export interface ChatSendPayload {
  senderId: string;
  senderName: string;
  content: string;
}

export interface DmSendPayload {
  senderId: string;
  targetId: string;
  content: string;
}

export interface GnosiaChatSendPayload {
  senderId: string;
  content: string;
}

export interface VoteSendPayload {
  voterId: string;
  targetId: string;
}

export interface ScanSendPayload {
  scannerId: string;
  targetId: string;
}

export interface DoctorCheckSendPayload {
  doctorId: string;
  targetId: string;
}

export interface ProtectSendPayload {
  gaId: string;
  targetId: string;
}

export interface KillSendPayload {
  voterId: string;
  targetId: string;
}

/** simple-peer signal + the in-room target the peer manager wants to reach. */
export interface SignalSendPayload {
  signal: Record<string, unknown>;
  targetId: string;
}