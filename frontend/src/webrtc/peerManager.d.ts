import type { Player } from '../types/contracts';

/**
 * Typed view of the still-JS `webrtc/peerManager.js` (MeshPeerManager).
 * Mirrors the exported class + option contract exactly so the TS hook can
 * consume it without `any`. Removed here when the JS module is converted.
 */
export type SignalPayload = Record<string, unknown>;

export interface MeshPeerManagerOptions {
  /** Forwards a signaled ICE candidate/answer to `targetId` via the room. */
  sendSignal: (frame: { signal: SignalPayload; targetId: string }) => void;
  /** Current camera/mic stream (null until granted + ready). */
  getLocalStream: () => MediaStream | null;
  /** Remote media for a peer arrived. */
  onRemoteStream: (targetId: string, stream: MediaStream) => void;
  /** A peer was torn down (partner left / failed). */
  onPeerRemoved: (targetId: string) => void;
}

export class MeshPeerManager {
  constructor(options: MeshPeerManagerOptions);
  /** Reconcile the mesh against the live roster (drop + paced initiations). */
  synchronize(players: Player[], selfId: string): void;
  /** Feed a SIG signal / duplicate / late offer into the matching peer. */
  handleSignal(fromId: string, signal: SignalPayload): void;
  teardown(): void;
  peerCount(): number;
}