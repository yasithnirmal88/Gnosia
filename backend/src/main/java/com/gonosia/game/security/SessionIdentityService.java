package com.gonosia.game.security;

import com.gonosia.game.model.Player;
import com.gonosia.game.model.Room;
import com.gonosia.game.service.RoomManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class SessionIdentityService {
    private static final Logger log = LoggerFactory.getLogger(SessionIdentityService.class);

    public static final String ACTOR_HEADER = "gonosiaActorId";

    private static final Pattern CHANNEL_KEY_PATTERN = Pattern.compile("[A-Za-z0-9_-]{8,128}");
    private static final Pattern PLAYER_ID_PATTERN = Pattern.compile("[A-Za-z0-9_.-]{1,64}");

    private final RoomManager roomManager;
    private final Map<String, PlayerIdentity> bySession = new ConcurrentHashMap<>();
    private final Map<String, PlayerIdentity> byPlayer = new ConcurrentHashMap<>();

    public SessionIdentityService(RoomManager roomManager) {
        this.roomManager = roomManager;
    }

    public record Actor(Player player, String channelKey) {
        public String privateTopic() {
            return "/topic/private/" + channelKey;
        }
    }

    public enum ClaimResult {
        OK, INVALID_PLAYER_ID, INVALID_KEY, SESSION_ALREADY_BOUND, WRONG_KEY, ALREADY_ACTIVE_ELSEWHERE
    }

    public static boolean isValidChannelKey(String key) {
        return key != null && CHANNEL_KEY_PATTERN.matcher(key).matches();
    }

    public static boolean isValidPlayerId(String id) {
        return id != null && PLAYER_ID_PATTERN.matcher(id).matches();
    }

    public static class PlayerIdentity {
        private final String playerId;
        private final String channelKey;
        private volatile String roomCode;
        private volatile String sessionId;
        private volatile boolean connected;

        PlayerIdentity(String playerId, String channelKey, String roomCode, String sessionId, boolean connected) {
            this.playerId = playerId;
            this.channelKey = channelKey;
            this.roomCode = roomCode;
            this.sessionId = sessionId;
            this.connected = connected;
        }

        public String playerId() { return playerId; }
        public String channelKey() { return channelKey; }
        public String roomCode() { return roomCode; }
        public void setRoomCode(String roomCode) { this.roomCode = roomCode; }
        public String sessionId() { return sessionId; }
        public void setSessionId(String sessionId) { this.sessionId = sessionId; }
        public boolean connected() { return connected; }
        public void setConnected(boolean connected) { this.connected = connected; }
    }

    public synchronized ClaimResult claim(String sessionId, String playerId, String presentedKey, String roomCode) {
        if (!isValidChannelKey(presentedKey)) return ClaimResult.INVALID_KEY;
        if (!isValidPlayerId(playerId)) return ClaimResult.INVALID_PLAYER_ID;

        PlayerIdentity existingForSession = bySession.get(sessionId);
        if (existingForSession != null && !existingForSession.playerId().equals(playerId)) {
            return ClaimResult.SESSION_ALREADY_BOUND;
        }

        PlayerIdentity existingForPlayer = byPlayer.get(playerId);
        if (existingForPlayer != null) {
            if (!existingForPlayer.channelKey().equals(presentedKey)) return ClaimResult.WRONG_KEY;
            if (existingForPlayer.connected()) {
                if (!existingForPlayer.sessionId().equals(sessionId)) return ClaimResult.ALREADY_ACTIVE_ELSEWHERE;
                return ClaimResult.OK;
            }
            bySession.put(sessionId, existingForPlayer);
            existingForPlayer.setSessionId(sessionId);
            existingForPlayer.setRoomCode(roomCode);
            existingForPlayer.setConnected(true);
            return ClaimResult.OK;
        }

        PlayerIdentity identity = new PlayerIdentity(playerId, presentedKey, roomCode, sessionId, true);
        byPlayer.put(playerId, identity);
        bySession.put(sessionId, identity);
        return ClaimResult.OK;
    }

    public String playerIdForSession(String sessionId) {
        PlayerIdentity identity = bySession.get(sessionId);
        return identity != null ? identity.playerId() : null;
    }

    public Actor requireActor(String sessionId, Room room) {
        if (sessionId == null || room == null) return null;
        PlayerIdentity identity = bySession.get(sessionId);
        if (identity == null || !identity.connected()) return null;
        if (identity.roomCode() == null || !identity.roomCode().equals(room.getRoomCode())) return null;
        Player player = room.getPlayer(identity.playerId());
        if (player == null) return null;
        return new Actor(player, identity.channelKey());
    }

    public String privateTopicForPlayer(String playerId) {
        PlayerIdentity identity = byPlayer.get(playerId);
        return identity != null ? "/topic/private/" + identity.channelKey() : null;
    }

    public synchronized void disconnect(String sessionId) {
        PlayerIdentity identity = bySession.remove(sessionId);
        if (identity == null) return;
        identity.setConnected(false);
        identity.setSessionId(null);
        log.info("[AUTH] Session {} disconnected, identity {} released", sessionId, identity.playerId());
    }

    @EventListener
    public void onSessionDisconnect(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();
        PlayerIdentity identity = bySession.get(sessionId);
        if (identity == null) return;
        String playerId = identity.playerId();
        String roomCode = identity.roomCode();
        disconnect(sessionId);
        Room room = roomManager.getRoom(roomCode);
        if (room != null) {
            Player player = room.getPlayer(playerId);
            if (player != null) player.setConnected(false);
        }
    }
}