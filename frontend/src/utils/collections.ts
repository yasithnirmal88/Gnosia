/**
 * Bounded, replay-only message lists.
 *
 * The server broadcasts every chat/DM frame to the room; a long-running tab
 * would otherwise accumulate unbounded arrays in React state. These helpers
 * keep source state capped while the UI can still render a sliding window.
 */

/** Append `item` to `list`, dropping the oldest entries beyond `max`. */
export const pushBounded = <T>(list: readonly T[], item: T, max: number): T[] => {
  if (max <= 0) return [item];
  const next = list.length >= max ? list.slice(-(max - 1)) : list;
  return [...next, item];
};

export const MAX_PUBLIC_MESSAGES = 500;
export const MAX_GNOSIA_CHAT_MESSAGES = 200;
export const MAX_DM_MESSAGES_PER_PARTNER = 200;