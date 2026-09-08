/**
 * Typed view of the still-JS `audio/LeviAudio.js` scenario API. Included so TS
 * modules (useGame now, components later) can call the narrator lines without
 * `any`. Removed here when the JS module is converted.
 */
export const LeviAudio: {
  /** A specific voice line (phase audiences via useGame); no-op by design. */
  play(phase: string): void;
  /** A single named effect (LEVI_ANNOUNCEMENT audio filename). */
  playEffect(filename: string): void;
  /** Resume all cached audio elements (call on a user gesture). */
  resumeAll(): void;
  announceCrewCount(count: number): Promise<void>;
  announceGnosia(count: number): Promise<void>;
  announceRoles(roles?: string[]): Promise<void>;
  announceRoundStart(crewCount: number, gnosiaCount: number, roles?: string[]): Promise<void>;
  announceColdSleep(playerName: string): Promise<void>;
  announceWarp(missingPlayers?: string[]): Promise<void>;
  announceVotingStart(): Promise<void>;
  announceVotingEnd(): Promise<void>;
  announceCrewWin(): Promise<void>;
  announceGnosiaWin(): Promise<void>;
};