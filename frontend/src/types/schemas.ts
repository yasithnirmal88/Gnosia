/**
 * Zod wire schemas — runtime validation for the STOMP boundary.
 *
 * These schemas are the single source of truth for what crosses the socket:
 * they validate before any React state is touched, and their inferred types
 * are pinned to the shared contracts (./contracts) so the compile-time view and
 * the runtime check cannot drift. Where the backend may omit a field (e.g.
 * private-only role) the schema is lenient; fields the backend always sends
 * are required or given a safe default so consumers get a complete GameState.
 */
import { z } from 'zod';
import {
  ROLES,
  PHASES,
  type ChatMessage,
  type GameAnalytics,
  type GameConfig,
  type GameState,
  type Player,
  type Room,
} from './contracts';

export const roleSchema = z.enum(ROLES);
export const phaseSchema = z.enum(PHASES);
export const roleCheckResultSchema = z.enum(['GNOSIA', 'HUMAN']);

/** PlayerResponse.java. `role` is optional: public frames hide it, only the
 * viewer (or all roles after death/cryosleep) receive it. */
export const playerSchema: z.ZodType<Player> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string().optional(),
  role: roleSchema.optional(),
  alive: z.boolean(),
  cryoslept: z.boolean().optional(),
  votedFor: z.string().nullable().optional(),
  connected: z.boolean().optional(),
}).passthrough();

/** GameState.java. The maps always exist on the DTO; `.default()` also
 * normalizes a frame that omits them (older fixtures, partial broadcasts).
 * Input is widened to `unknown` because `default()` relaxes the accepted input
 * while the parsed output stays the full GameState. */
export const gameStateSchema: z.ZodType<GameState, z.ZodTypeDef, unknown> = z.object({
  phase: phaseSchema,
  remainingTimeSeconds: z.number().finite(),
  currentVotes: z.record(z.string(), z.string()).default({}),
  lastCryosleptPlayerId: z.string().nullable().optional(),
  protectedPlayerId: z.string().nullable().optional(),
  gnosiaTargetPlayerId: z.string().nullable().optional(),
  lastRoleResults: z.record(z.string(), z.string()).default({}),
  leviObservations: z.array(z.string()).default([]),
  behavioralInsights: z.record(z.string(), z.array(z.string())).default({}),
  gnosiaVotes: z.record(z.string(), z.string()).default({}),
  votingResults: z.record(z.string(), z.string()).default({}),
  playerActionDone: z.record(z.string(), z.string()).default({}),
  winner: roleSchema.nullable().optional(),
  gnosiaStillOnboard: z.boolean().default(false),
}).passthrough();

/** GameConfig.java */
export const gameConfigSchema: z.ZodType<GameConfig> = z.object({
  maxPlayers: z.number(),
  gnosiaCount: z.number().optional(),
  votingTimeSeconds: z.number().optional(),
  resultTimeSeconds: z.number().optional(),
  roleActionTimeSeconds: z.number().optional(),
  warpTimeSeconds: z.number().optional(),
  discussionTimeSeconds: z.number().optional(),
}).passthrough();

/** GameAnalytics.java (start/end serialize as ISO-8601 strings). */
export const gameAnalyticsSchema: z.ZodType<GameAnalytics> = z.object({
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  durationSeconds: z.number().optional(),
  winnerRole: roleSchema.nullable().optional(),
  votesPerPlayer: z.record(z.string(), z.number()).optional(),
  eliminationOrder: z.array(z.string()).optional(),
  mvpId: z.string().nullable().optional(),
}).passthrough();

/** RoomResponse.java */
export const roomSchema: z.ZodType<Room, z.ZodTypeDef, unknown> = z.object({
  roomCode: z.string().min(1),
  players: z.array(playerSchema),
  gameState: gameStateSchema,
  analytics: gameAnalyticsSchema.nullable().optional(),
  votingHistory: z.array(z.record(z.string(), z.string())).nullable().optional(),
  config: gameConfigSchema.nullable().optional(),
}).passthrough();

/** ChatMessage.java */
export const chatMessageSchema: z.ZodType<ChatMessage> = z.object({
  senderId: z.string().min(1),
  senderName: z.string(),
  content: z.string(),
  gonosiaOnly: z.boolean().optional(),
}).passthrough();

/** Lightweight countdown frame (GameService#broadcastTimerUpdate). `type` is
 * sent by the server but tolerated as optional for older fixtures. */
export const timerUpdateSchema = z.object({
  type: z.literal('TIMER_UPDATE').optional(),
  phase: phaseSchema,
  remainingTimeSeconds: z.number().finite(),
});
export type TimerUpdate = z.infer<typeof timerUpdateSchema>;

/** /events room topic — special announcements (see GameService/GameController). */
export const leviAnnouncementSchema = z.object({
  type: z.literal('LEVI_ANNOUNCEMENT'),
  sequence: z.array(z.string()).optional(),
  audio: z.string().optional(),
}).passthrough();
export const shieldTriggeredSchema = z.object({
  type: z.literal('SHIELD_TRIGGERED'),
  targetId: z.string().min(1),
}).passthrough();
export const gnosiaConsensusSchema = z.object({
  type: z.literal('GNOSIA_CONSENSUS'),
  targetId: z.string().min(1),
  targetName: z.string().optional(),
}).passthrough();
/** Forward-compatible catch-all so unheard-of event types never crash or drop
 * the event (the handler decides whether to render them). */
export const unknownEventSchema = z.record(z.string(), z.unknown());

export const gameEventSchema = z.union([
  leviAnnouncementSchema,
  shieldTriggeredSchema,
  gnosiaConsensusSchema,
  unknownEventSchema,
]);
export type GameEvent = z.infer<typeof gameEventSchema>;

/** WebRTC signal relay (GameController#handleSignal). The raw SDP/ICE payload
 * is opaque here; extra fields are preserved via `.passthrough()`. */
export const signalFrameSchema = z.object({
  type: z.literal('SIGNAL'),
  fromId: z.string().min(1),
  signal: z.record(z.string(), z.unknown()),
}).passthrough();

/** Private topic /topic/private/{channelKey} — discriminated on `type`. */
export const privateFrameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ROOM_CREATED'),
    roomCode: z.string().min(1),
    playerId: z.string().optional(),
  }).passthrough(),
  z.object({
    type: z.literal('JOIN_CONFIRMED'),
    roomCode: z.string().min(1),
    playerId: z.string().optional(),
  }).passthrough(),
  z.object({
    type: z.literal('JOIN_ERROR'),
    message: z.string(),
  }).passthrough(),
  z.object({
    type: z.literal('PRIVATE_INFO'),
    role: roleSchema,
    actionDone: z.string().nullable().optional(),
    partners: z.array(z.string()).optional(),
  }).passthrough(),
  z.object({
    type: z.literal('SCAN_RESULT'),
    targetId: z.string(),
    result: roleCheckResultSchema,
  }).passthrough(),
  z.object({
    type: z.literal('DOCTOR_CHECK_RESULT'),
    targetId: z.string(),
    result: roleCheckResultSchema,
  }).passthrough(),
  z.object({
    type: z.literal('ACTION_REJECTED'),
    action: z.string(),
    reason: z.string(),
  }).passthrough(),
  z.object({
    type: z.literal('GNOSIA_CHAT'),
    message: chatMessageSchema,
  }).passthrough(),
  z.object({
    type: z.literal('DM'),
    message: chatMessageSchema,
    withId: z.string().min(1),
  }).passthrough(),
  signalFrameSchema,
]);
export type PrivateFrame = z.infer<typeof privateFrameSchema>;

/** Narrowed helper types for the router handlers. */
export type PrivateInfoFrame = Extract<PrivateFrame, { type: 'PRIVATE_INFO' }>;
export type ScanResultFrame = Extract<PrivateFrame, { type: 'SCAN_RESULT' }>;
export type DoctorResultFrame = Extract<PrivateFrame, { type: 'DOCTOR_CHECK_RESULT' }>;
export type ActionRejectedFrame = Extract<PrivateFrame, { type: 'ACTION_REJECTED' }>;
export type SignalFrame = Extract<PrivateFrame, { type: 'SIGNAL' }>;
export type DmFrame = Extract<PrivateFrame, { type: 'DM' }>;
export type GnosiaChatFrame = Extract<PrivateFrame, { type: 'GNOSIA_CHAT' }>;