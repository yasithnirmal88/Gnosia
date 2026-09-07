package com.gonosia.game.model;

/**
 * Lifecycle of a {@link Room} from creation to removal.
 *
 * <p>The in-game {@link Phase} (LOBBY/INTRO/DISCUSSION/...) describes what is
 * currently happening inside a game; the lifecycle describes the room object's
 * own existence and retention state on the server:
 *
 * <pre>
 *   CREATED  -- Room object constructed, not yet registered
 *   LOBBY    -- Registered, awaiting a game (accepts joins, pre-game)
 *   ACTIVE   -- A game is in progress ({@code Phase} != LOBBY / GAME_OVER)
 *   GAME_OVER -- The game finished; kept for the completed-game retention window
 *   CLEANUP  -- Sweeper decided to retire it; tearing down (releases identities)
 *   REMOVED  -- Terminal state: dropped from the registry, object released for GC
 * </pre>
 *
 * <p>{@link #CLEANUP} and {@link #REMOVED} are terminal bookkeeping states and
 * are never observed by clients: a room is unregistered immediately after
 * {@link #CLEANUP} (before {@link #REMOVED} is recorded) so no new traffic can
 * reach it.
 */
public enum LifecycleStatus {
    CREATED, LOBBY, ACTIVE, GAME_OVER, CLEANUP, REMOVED
}