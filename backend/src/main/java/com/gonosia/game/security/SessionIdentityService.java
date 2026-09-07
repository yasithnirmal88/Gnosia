package com.gonosia.game.security;

import com.gonosia.game.model.Player;
import com.gonosia.game.model.Room;
import com.gonosia.game.service.RoomManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.messaging.SessionConnectEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class SessionIdentityService {
    private static final Logger log = LoggerFactory.getLogger(SessionIdentityService.class);

    public static final String ACTOR_HEADER = "gonosiaActorId";

    /** WebSocket session attribute carrying the remote client address (set by the handshake interceptor). */
    public static final String CLIENT_IP_ATTRIBUTE = "gonosiaClientIp";

    private static final Pattern CHANNEL_KEY_PATTERN = Pattern.compile("[A-Za-z0-9_-]{8,128}");
    private static final Pattern PLAYER_ID_PATTERN = Pattern.compile("[A-Za-z0-9_.-]{1,64}");
    private static final Pattern ROOM_CODE_PATTERN = Pattern.compile("[A-Z0-9]{4,6}");
    private static final Pattern PIN_PATTERN = Pattern.compile("[0-9]{4,6}");

    private final RoomManager roomManager;
    private final Map<String, PlayerIdentity> bySession = new ConcurrentHashMap<>();
    private final Map<String, PlayerIdentity> byPlayer = new ConcurrentHashMap<>();
    private final Map<String, String> sessionIps = new ConcurrentHashMap<>();

    public SessionIdentityService(RoomManager roomManager) {
        this.roomManager = roomManager;
    }

    /** Record the remote client IP for a session, captured at handshake time. */
    public void registerIp(String sessionId, String ip) {
        if (sessionId != null && ip != null) {
            sessionIps.put(sessionId, ip);
        }
    }

    /** @return the remote IP recorded for a session, or null if unknown. */
    public String ipForSession(String sessionId) {
        return sessionId == null ? null : sessionIps.get(sessionId);
    }

    @EventListener
    public void onSessionConnect(SessionConnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();
        Object attributes = accessor.getSessionAttributes();
        if (sessionId != null && attributes instanceof Map<?, ?> sessionAttributes) {
            Object ip = sessionAttributes.get(CLIENT_IP_ATTRIBUTE);
            if (ip instanceof String) {
                registerIp(sessionId, (String) ip);
            }
        }
    }

    public record Actor(Player player, String channelKey) {
        public String privateTopic() {
            return "/topic/private/" + channelKey;
        }
    }

    public enum ClaimResult {
        OK, INVALID_PLAYER_ID, INVALID_KEY, SESSION_ALREADY_BOUND, WRONG_KEY, ALREADY_ACTIVE_ELSEWHERE,
        ALREADY_BOUND_TO_ROOM
    }

    public static boolean isValidChannelKey(String key) {
        return key != null && CHANNEL_KEY_PATTERN.matcher(key).matches();
    }

    public static boolean isValidPlayerId(String id) {
        return id != null && PLAYER_ID_PATTERN.matcher(id).matches();
    }

    public static boolean isValidRoomCode(String code) {
        return code != null && ROOM_CODE_PATTERN.matcher(code).matches();
    }

    public static boolean isValidPin(String pin) {
        return pin != null && PIN_PATTERN.matcher(pin).matches();
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
            if (existingForPlayer.roomCode() != null && !existingForPlayer.roomCode().equals(roomCode)) {
                return ClaimResult.ALREADY_BOUND_TO_ROOM;
            }
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

    public Actor requireRoomMembership(String sessionId, Room room) {
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
        sessionIps.remove(sessionId);
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