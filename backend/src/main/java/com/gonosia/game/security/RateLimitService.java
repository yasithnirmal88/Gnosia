package com.gonosia.game.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/**
 * Central, reusable application-level abuse protection for every real-time
 * channel. Controllers call one of the typed {@code allow*}/{@code gate*} methods
 * instead of scattering counter logic around; all limits, windows and scopes live
 * here and in {@link RateLimitProperties}.
 *
 * <p>Each call is checked against <em>every</em> applicable scope at once —
 * WebSocket session, player identity, room, and client IP — so an attacker is
 * bounded however they spam (multiple sessions from one IP, one session across
 * many actions, etc.). A denial happens <em>before</em> any business logic or
 * state mutation, which guarantees a rejected request never mutates game state.
 *
 * <p>Limits are coarse flood guards only. They are set generously enough that
 * legitimate gameplay is unaffected; the actual gameplay rules (e.g. one vote per
 * phase, one scan per warp) are enforced by {@link GameActionAuthorizationService},
 * and message-size rules by the chat/action handlers.
 *
 * <p>The underlying {@link RateLimiter} is in-memory for now (correct for a single
 * instance). See {@link InMemoryRateLimiter} for the multi-instance caveat.
 */
@Service
public class RateLimitService {

    private static final Logger log = LoggerFactory.getLogger(RateLimitService.class);

    /** Operation category — used for logging and per-category config lookup. */
    public enum Category {
        CHAT, DM, GNOSIA_CHAT, SIGNAL, GAME_ACTION, JOIN, ROOM_CREATION, MESSAGE_FLOOD
    }

    private final RateLimiter limiter;
    private final RateLimitProperties props;
    private final SessionIdentityService identityService;

    public RateLimitService(RateLimiter limiter, RateLimitProperties props, SessionIdentityService identityService) {
        this.limiter = limiter;
        this.props = props;
        this.identityService = identityService;
    }

    // ─── Public gates (controllers) ────────────────────────────────────────

    public boolean allowChat(String sessionId, String playerId, String roomCode) {
        return allowed(Category.CHAT, scopeKeys(Category.CHAT, sessionId, playerId, roomCode));
    }

    public boolean allowDm(String sessionId, String playerId, String roomCode) {
        return allowed(Category.DM, scopeKeys(Category.DM, sessionId, playerId, roomCode));
    }

    public boolean allowGnosiaChat(String sessionId, String playerId, String roomCode) {
        return allowed(Category.GNOSIA_CHAT, scopeKeys(Category.GNOSIA_CHAT, sessionId, playerId, roomCode));
    }

    public boolean allowSignal(String sessionId, String playerId) {
        return allowed(Category.SIGNAL, key(Category.SIGNAL, "session", sessionId),
                key(Category.SIGNAL, "player", playerId), key(Category.SIGNAL, "ip", ip(sessionId)));
    }

    public boolean allowGameAction(String sessionId, String playerId, String roomCode) {
        // Per-session/player/room only. IP is deliberately excluded: many players
        // legitimately share one IP (NAT/proxy), and game actions are already
        // bound tightly per actor and per room. A global per-IP cap here would
        // throttle legitimate simultaneous actors behind a shared address.
        return allowed(Category.GAME_ACTION, key(Category.GAME_ACTION, "session", sessionId),
                key(Category.GAME_ACTION, "player", playerId), key(Category.GAME_ACTION, "room", roomCode));
    }

    public boolean allowJoin(String sessionId) {
        // Join (+ reconnect) is bounded per session and per IP; player/room are not
        // yet known/stable at join time, so they are deliberately not scoped here.
        return allowed(Category.JOIN, key(Category.JOIN, "session", sessionId),
                key(Category.JOIN, "ip", ip(sessionId)));
    }

    public boolean allowRoomCreation(String sessionId) {
        return allowed(Category.ROOM_CREATION, key(Category.ROOM_CREATION, "session", sessionId),
                key(Category.ROOM_CREATION, "ip", ip(sessionId)));
    }

    /** Catch-all flood guard for any inbound STOMP SEND, even from an unauthenticated session. */
    public boolean allowMessageFlood(String sessionId) {
        return allowed(Category.MESSAGE_FLOOD, key(Category.MESSAGE_FLOOD, "session", sessionId),
                key(Category.MESSAGE_FLOOD, "ip", ip(sessionId)));
    }

    /**
     * Release rate-limit buckets tied to a single WebSocket session (and its IP)
     * when it disconnects, so a reconnect does not inherit stale counters from a
     * previous, possibly long-lived connection.
     */
    public void clearSession(String sessionId) {
        if (sessionId == null) return;
        for (Category category : Category.values()) {
            limiter.clear(key(category, "session", sessionId));
        }
        String ip = ip(sessionId);
        if (ip != null) {
            for (Category category : Category.values()) {
                limiter.clear(key(category, "ip", ip));
            }
        }
    }

    @EventListener
    public void onSessionDisconnect(SessionDisconnectEvent event) {
        clearSession(event.getSessionId());
    }

    /** Drop every rate-limit bucket. Primarily for test isolation. */
    public void resetAll() {
        limiter.reset();
    }

    // ─── Internals ─────────────────────────────────────────────────────────

    /**
     * Build the composite scope keys (session, player, room) for a category.
     *
     * IP is deliberately NOT included here for the per-user message channels:
     * multiple players legitimately share one NAT/proxy address, and a per-IP cap
     * per chat/DM channel would throttle a whole household or LAN simultaneously.
     * Per-IP traffic is still bounded at the coarser message-flood guard, which
     * covers every inbound SEND and protects the server regardless of identity.
     */
    private String[] scopeKeys(Category category, String sessionId, String playerId, String roomCode) {
        return new String[]{
            key(category, "session", sessionId),
            key(category, "player", playerId),
            key(category, "room", roomCode)
        };
    }

    private boolean allowed(Category category, String... keys) {
        if (!props.isEnabled()) {
            return true;
        }
        RateLimitProperties.Limit limit = limitFor(category);
        boolean allowed = true;
        for (String rawKey : keys) {
            if (rawKey == null) continue;
            if (!limiter.tryAcquire(rawKey, limit.getLimit(), limit.getWindowMs())) {
                allowed = false;
                if (log.isDebugEnabled()) {
                    log.debug("[RATE-LIMIT] {} blocked on {}", category, rawKey);
                }
            }
        }
        return allowed;
    }

    private RateLimitProperties.Limit limitFor(Category category) {
        switch (category) {
            case CHAT:          return props.getChat();
            case DM:            return props.getDm();
            case GNOSIA_CHAT:   return props.getGnosiaChat();
            case SIGNAL:        return props.getSignal();
            case GAME_ACTION:   return props.getGameAction();
            case JOIN:          return props.getJoin();
            case ROOM_CREATION: return props.getRoomCreation();
            case MESSAGE_FLOOD: return props.getMessageFlood();
            default:            return props.getChat();
        }
    }

    private String ip(String sessionId) {
        return identityService.ipForSession(sessionId);
    }

    private String key(Category category, String scope, String value) {
        return value == null ? null : category.name().toLowerCase() + ":" + scope + ":" + value;
    }
}
