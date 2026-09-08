/**
 * Shared domain contracts.
 *
 * These mirror the backend DTOs (com.gonosia.game.model.*) as emitted by Jackson.
 * Field names follow the Java bean getter serialization, e.g. `isAlive()` → `alive`.
 * The wire-facing validation lives in ./schemas; this file is the compile-time
 * view used across the app once modules migrate to TypeScript.
 */

/** Role.java */
export const ROLES = [
  'HUMAN',
  'GNOSIA',
  'ENGINEER',
  'DOCTOR',
  'GUARDIAN_ANGEL',
] as const;
export type Role = (typeof ROLES)[number];

/** Phase.java */
export const PHASES = [
  'LOBBY',
  'INTRO',
  'DISCUSSION',
  'VOTING',
  'CRYOSLEEP',
  'ROLE_ACTIONS',
  'WARP',
  'RESULT',
  'GAME_OVER',
] as const;
export type Phase = (typeof PHASES)[number];

/** PlayerResponse.java */
export interface Player {
  id: string;
  name: string;
  /** "/images/{name}.png" */
  avatar?: string;
  /** Only present for the viewer or when all roles are exposed (dead/cryoslept). */
  role?: Role;
  alive: boolean;
  cryoslept?: boolean;
  votedFor?: string | null;
  connected?: boolean;
}

/** GameConfig.java */
export interface GameConfig {
  maxPlayers: number;
  /** 0 means auto-assigned by the server. */
  gnosiaCount?: number;
  votingTimeSeconds?: number;
  resultTimeSeconds?: number;
  roleActionTimeSeconds?: number;
  warpTimeSeconds?: number;
  /** Read-only convenience getter on the DTO (round-1 default). */
  discussionTimeSeconds?: number;
}

/** GameState.java */
export interface GameState {
  phase: Phase;
  remainingTimeSeconds: number;
  /** SourcePlayerID → TargetPlayerID */
  currentVotes: Record<string, string>;
  lastCryosleptPlayerId?: string | null;
  protectedPlayerId?: string | null;
  gnosiaTargetPlayerId?: string | null;
  /** PlayerID → Result (for role investigations) */
  lastRoleResults: Record<string, string>;
  /** AI narrator insights */
  leviObservations: string[];
  /** e.g. "Frequent Partners" → list of player ids */
  behavioralInsights: Record<string, string[]>;
  /** GnosiaID → TargetID (WARP consensus ballots) */
  gnosiaVotes: Record<string, string>;
  /** VoterID → TargetID (revealed after CRYOSLEEP) */
  votingResults: Record<string, string>;
  /** playerId → last completed action type (reconnect recovery) */
  playerActionDone: Record<string, string>;
  winner?: Role | null;
  gnosiaStillOnboard: boolean;
}

/** GameAnalytics.java (startTime/endTime serialize as ISO-8601 strings). */
export interface GameAnalytics {
  startTime?: string | null;
  endTime?: string | null;
  durationSeconds?: number;
  winnerRole?: Role | null;
  votesPerPlayer?: Record<string, number>;
  eliminationOrder?: string[];
  mvpId?: string | null;
}

/**
 * A single recorded voting round: voterId → targetId (a snapshot of
 * GameState.currentVotes, see RoomManager#recordVotingRound).
 */
export type VotingRound = Record<string, string>;

/** RoomResponse.java */
export interface Room {
  roomCode: string;
  players: Player[];
  gameState: GameState;
  analytics?: GameAnalytics | null;
  votingHistory?: VotingRound[] | null;
  config?: GameConfig | null;
}

/** ChatMessage.java — the public-room / DM envelope payload. */
export interface ChatMessage {
  senderId: string;
  senderName: string;
  content: string;
  /** Server-controlled display hint for the gnosia-only channel. */
  gonosiaOnly?: boolean;
}

/**
 * A chat/gnosia/DM message once the router has stamped a stable client-side id
 * (the server sends none). These ids back React keys and stay unique per tab.
 */
export type PublicMessage = ChatMessage & { id: string };