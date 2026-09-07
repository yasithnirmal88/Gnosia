package com.gonosia.game.service;

import com.gonosia.game.model.GameState;
import com.gonosia.game.model.Phase;
import com.gonosia.game.model.GameConfig;
import com.gonosia.game.model.Room;
import com.gonosia.game.security.SessionIdentityService;
import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.ArrayList;
import java.security.SecureRandom;

@Service
public class RoomManager {
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 6;

    private final Map<String, Room> activeRooms = new ConcurrentHashMap<>();
    private final SecureRandom secureRandom = new SecureRandom();

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
        room.initialize();
        activeRooms.put(room.getRoomCode(), room);
        return room;
    }

    public Room getRoom(String roomCode) {
        return activeRooms.get(roomCode);
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

    public void removeRoom(String roomCode) {
        activeRooms.remove(roomCode);
    }

    public Map<String, Room> getAllRooms() {
        return activeRooms;
    }
}
