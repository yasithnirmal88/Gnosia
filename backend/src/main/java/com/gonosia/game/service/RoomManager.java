package com.gonosia.game.service;

import com.gonosia.game.model.GameState;
import com.gonosia.game.model.Phase;
import com.gonosia.game.model.GameConfig;
import com.gonosia.game.model.Room;
import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.UUID;
import java.util.ArrayList;

@Service
public class RoomManager {
    private final Map<String, Room> activeRooms = new ConcurrentHashMap<>();

    public Room createRoom(String roomCode, int maxPlayers, String pin) {
        Room room = new Room();
        room.setRoomCode(roomCode != null ? roomCode : UUID.randomUUID().toString().substring(0, 6).toUpperCase());
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

    public void removeRoom(String roomCode) {
        activeRooms.remove(roomCode);
    }

    public Map<String, Room> getAllRooms() {
        return activeRooms;
    }
}
