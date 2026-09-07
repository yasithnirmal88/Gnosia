package com.gonosia.game.service;

import com.gonosia.game.config.RoomLifecycleProperties;
import com.gonosia.game.model.LifecycleStatus;
import com.gonosia.game.model.Phase;
import com.gonosia.game.model.Room;
import com.gonosia.game.security.SessionIdentityService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Owns the room-retention sweep. Runs on the Spring scheduler (a single thread,
 * shared with {@link TimerService#tick()}, so it never races a timer-driven
 * phase transition) and is also Callable directly, which integration tests use
 * to exercise each policy deterministically.
 *
 * <p>Lifecycle model:
 * <pre>
 *   CREATED → LOBBY → ACTIVE → GAME_OVER → (retention) → CLEANUP → REMOVED
 * </pre>
 *
 * <p>Policies (each configurable via {@code app.room-lifecycle.*}):
 * <ul>
 *   <li><b>Completed games</b> — rooms in GAME_OVER are kept for
 *       {@code completedRetentionSeconds} so players can view results and a
 *       reconnecting client can still re-join the finished room.</li>
 *   <li><b>Empty rooms</b> — lobby rooms that never got a single player are
 *       dropped after {@code emptyRetentionSeconds}.</li>
 *   <li><b>Abandoned rooms</b> — a room (lobby or in-game) in which every player
 *       has disconnected is dropped after {@code abandonedRetentionSeconds}.
 *       The window doubles as the legitimate reconnect grace: a reconnect
 *       inside it keeps the room alive (disconnect timestamp is cleared).</li>
 * </ul>
 *
 * <p>A room is never removed while it still has connected players, and the sweep
 * also prunes stale session identities that reference rooms that no longer exist.
 */
@Service
public class RoomCleanupService {

    private static final Logger log = LoggerFactory.getLogger(RoomCleanupService.class);

    private final RoomManager roomManager;
    private final SessionIdentityService identityService;
    private final RoomLifecycleProperties properties;

    public RoomCleanupService(RoomManager roomManager, SessionIdentityService identityService,
            RoomLifecycleProperties properties) {
        this.roomManager = roomManager;
        this.identityService = identityService;
        this.properties = properties;
    }

    @Scheduled(
            fixedDelayString = "${app.room-lifecycle.sweep-interval-ms:30000}",
            initialDelayString = "${app.room-lifecycle.sweep-interval-ms:30000}")
    public void sweepScheduled() {
        sweep();
    }

    /** Idempotent sweep over every registered room; safe to call concurrently or manually. */
    public void sweep() {
        try {
            long now = System.currentTimeMillis();
            long completedMs = properties.getCompletedRetentionSeconds() * 1000L;
            long abandonedMs = properties.getAbandonedRetentionSeconds() * 1000L;
            long emptyMs = properties.getEmptyRetentionSeconds() * 1000L;

            for (Room room : roomManager.getAllRooms().values()) {
                LifecycleStatus lifecycle = room.getLifecycle();
                if (lifecycle == LifecycleStatus.CLEANUP || lifecycle == LifecycleStatus.REMOVED) {
                    continue;
                }
                if (room.getGameState() == null) {
                    continue;
                }

                Phase phase = room.getGameState().getPhase();

                // 1) Completed games: keep for the results/reconnect window, then retire.
                if (phase == Phase.GAME_OVER || lifecycle == LifecycleStatus.GAME_OVER) {
                    if (retentionElapsed(now, room.getGameOverAtMillis(), completedMs)) {
                        retire(room);
                    }
                    continue;
                }

                // 2) Lobby rooms that never filled: no players at all.
                if (phase == Phase.LOBBY && room.getPlayers().isEmpty()) {
                    if (retentionElapsed(now, room.getCreatedAtMillis(), emptyMs)) {
                        retire(room);
                    }
                    continue;
                }

                // 3) Everyone gone: give the reconnect-window, then retire.
                //    A reconnect inside the window clears the disconnect timestamp
                //    (RoomManager#touch), so the room survives legitimate reconnects.
                if (room.connectedPlayerCount() == 0 && room.getLastDisconnectMillis() > 0) {
                    if (retentionElapsed(now, room.getLastDisconnectMillis(), abandonedMs)) {
                        retire(room);
                    }
                }
            }

            // Prune session identities that point at rooms that no longer exist.
            identityService.sweepStale(roomManager.aliveRoomCodes());
        } catch (Exception e) {
            log.error("[CLEANUP] Sweep failed: {}", e.getMessage(), e);
        }
    }

    private boolean retentionElapsed(long now, long sinceMillis, long retentionMs) {
        if (sinceMillis <= 0) return false;
        return now - sinceMillis >= retentionMs;
    }

    /**
     * Teardown for a room the sweep decided to retire. Marks it CLEANUP while the
     * identity release and data teardown happen, then unregisters it (REMOVED).
     * Only the room that actually won the unregister race does the work, so two
     * overlapping sweeps cannot double-retire.
     */
    void retire(Room room) {
        String code = room.getRoomCode();
        room.setLifecycle(LifecycleStatus.CLEANUP);
        identityService.releaseRoom(code);
        Room removed = roomManager.removeRoom(code);
        if (removed != null) {
            log.info("[CLEANUP] Retired room {} (players={}, lifecycle={})",
                    code,
                    removed.getGameState() != null && removed.getPlayers() != null
                            ? removed.getPlayers().size() : 0,
                    removed.getLifecycle());
            removed.clearTransientState();
        }
    }
}