/**
 * Typed view of the still-JS `audio/LeviAudio.js` scenario API. Included so TS
 * modules (useGame now, components later) can call the narrator lines without
 * `any`. Removed here when the JS module is converted.
 */
export const LeviAudio: {
  /** A specific voice line (phase audiences via useGame); no-op by design. */
  play(phase: string): void;
  /** Resume all cached audio elements (call on a user gesture). */
  resumeAll(): void;
};