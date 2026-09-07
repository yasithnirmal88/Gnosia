package com.gonosia.game.service;

import com.gonosia.game.config.RoomLifecycleProperties;
import com.gonosia.game.model.GameState;
import com.gonosia.game.model.LifecycleStatus;
import com.gonosia.game.model.Phase;
import com.gonosia.game.model.GameConfig;
import com.gonosia.game.model.Room;
import com.gonosia.game.security.SessionIdentityService;
import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.ArrayList;
import java.security.SecureRandom;

@Service
public class RoomManager {
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 6;

    private final Map<String, Room> activeRooms = new ConcurrentHashMap<>();
    private final SecureRandom secureRandom = new SecureRandom();
    private final RoomLifecycleProperties lifecycleProperties;

    public RoomManager(RoomLifecycleProperties lifecycleProperties) {
        this.lifecycleProperties = lifecycleProperties;
    }

    public Room createRoom(String roomCode, int maxPlayers, String pin) {
        String code = normalizeCode(roomCode);
        if (code == null) {
            code = generateCode();
        }
        Room room = new Room();
        room.setRoomCode(code);
        room.setPin(pin);
        room.setPlayers(new ArrayList<>());

        GameConfig config = new GameConfig();
        config.setMaxPlayers(maxPlayers > 0 ? maxPlayers : 15);
        room.setConfig(config);

        GameState gameState = new GameState();
        gameState.setPhase(Phase.LOBBY);
        gameState.setRemainingTimeSeconds(0);
        gameState.setCurrentVotes(new HashMap<>());
        gameState.setLastRoleResults(new HashMap<>());

        room.setGameState(gameState);
        long now = System.currentTimeMillis();
        room.setCreatedAtMillis(now);
        room.setLastActivityMillis(now);
        room.setLifecycle(LifecycleStatus.LOBBY);
        room.initialize();
        activeRooms.put(room.getRoomCode(), room);
        return room;
    }

    public Room getRoom(String roomCode) {
        return activeRooms.get(roomCode);
    }

    /**
     * Marks a room as active on this server: someone is in it right now. Clears
     * the "last disconnected" timestamp so an abandoned-room sweep does not fire
     * while activity exists; call on any join/reconnect and on activity.
     */
    public void touch(Room room) {
        if (room == null) return;
        long now = System.currentTimeMillis();
        room.setLastActivityMillis(now);
        room.setLastDisconnectMillis(0);
    }

    /**
     * Records the moment the last connected player left. Called from disconnect
     * handling; used by the sweep to retire abandoned rooms after the configured
     * reconnect grace window.
     */
    public void markAllDisconnected(Room room) {
        if (room == null) return;
        room.setLastDisconnectMillis(System.currentTimeMillis());
    }

    /** Game started (LOBBY → first-ever transition): room enters ACTIVE lifecycle. */
    public void markActive(Room room) {
        if (room == null) return;
        if (room.getLifecycle() == LifecycleStatus.LOBBY
                || room.getLifecycle() == LifecycleStatus.CREATED) {
            room.setLifecycle(LifecycleStatus.ACTIVE);
        }
        touch(room);
    }

    /** Game finished: room enters GAME_OVER lifecycle and records when it ended. */
    public void markGameOver(Room room) {
        if (room == null) return;
        // Never regress from an already-terminal lifecycle.
        if (room.getLifecycle() == LifecycleStatus.CLEANUP
                || room.getLifecycle() == LifecycleStatus.REMOVED) {
            return;
        }
        room.setLifecycle(LifecycleStatus.GAME_OVER);
        room.setGameOverAtMillis(System.currentTimeMillis());
    }

    /**
     * Records one voting round, keeping {@code votingHistory} bounded so a long
     * or multi-game room cannot accumulate unbounded memory.
     */
    public void recordVotingRound(Room room, Map<String, String> round) {
        if (room == null) return;
        room.getVotingHistory().add(round);
        int cap = lifecycleProperties.getMaxVotingHistory();
        if (cap >= 0) {
            while (room.getVotingHistory().size() > cap) {
                room.getVotingHistory().remove(0);
            }
        }
    }

    private String normalizeCode(String roomCode) {
        if (roomCode == null) return null;
        String trimmed = roomCode.trim().toUpperCase();
        return SessionIdentityService.isValidRoomCode(trimmed) ? trimmed : null;
    }

    private String generateCode() {
        String code;
        do {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i++) {
                sb.append(CODE_ALPHABET.charAt(secureRandom.nextInt(CODE_ALPHABET.length())));
            }
            code = sb.toString();
        } while (activeRooms.containsKey(code));
        return code;
    }

    /** Unregister a room. Returns the removed room, or null if it was already gone. */
    public Room removeRoom(String roomCode) {
        Room removed = activeRooms.remove(roomCode);
        if (removed != null) {
            removed.setLifecycle(LifecycleStatus.REMOVED);
        }
        return removed;
    }

    public Map<String, Room> getAllRooms() {
        return activeRooms;
    }

    /** Codes of rooms still registered — used to sweep stale session identities. */
    public Set<String> aliveRoomCodes() {
        return activeRooms.keySet();
    }

    public int roomCount() {
        return activeRooms.size();
    }
}