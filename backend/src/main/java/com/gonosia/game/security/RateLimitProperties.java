package com.gonosia.game.security;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Configurable, per-category rate limits. Each category has its own
 * {@code limit} (max units) over a fixed {@code windowMs} (window length in
 * milliseconds). Limits are deliberately generous so a legitimate player is never
 * blocked mid-game — the coarse flood guard only trips against sustained abuse.
 * Business rules (e.g. a player can only vote once per phase) are enforced
 * separately by {@link GameActionAuthorizationService} and provide the real
 * gameplay protection.
 *
 * <p>Configured in {@code application.properties} via the {@code app.rate-limit.*}
 * prefix (overridable through environment variables), for example:
 * <pre>
 *   app.rate-limit.enabled=true
 *   app.rate-limit.chat.limit=15
 *   app.rate-limit.chat.window-ms=1000
 * </pre>
 */
@Component
@ConfigurationProperties(prefix = "app.rate-limit")
public class RateLimitProperties {

    /** Master switch — set to false to disable all application-level rate limiting. */
    private boolean enabled = true;

    private Limit chat = new Limit(15, 1000);
    private Limit dm = new Limit(15, 1000);
    private Limit gnosiaChat = new Limit(15, 1000);
    /** WebRTC signaling is the most frame-heavy legitimate channel — generous burst. */
    private Limit signal = new Limit(30, 1000);
    /** Game actions (start/vote/scan/doctorCheck/protect/kill). */
    private Limit gameAction = new Limit(20, 1000);
    /** Join attempts (also guards reconnects) per session/IP. */
    private Limit join = new Limit(20, 10000);
    /** Room creation per session/IP. */
    private Limit roomCreation = new Limit(5, 60000);
    /** Catch-all inbound STOMP frame flood guard per session. */
    private Limit messageFlood = new Limit(200, 1000);

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public Limit getChat() {
        return chat;
    }

    public void setChat(Limit chat) {
        this.chat = chat;
    }

    public Limit getDm() {
        return dm;
    }

    public void setDm(Limit dm) {
        this.dm = dm;
    }

    public Limit getGnosiaChat() {
        return gnosiaChat;
    }

    public void setGnosiaChat(Limit gnosiaChat) {
        this.gnosiaChat = gnosiaChat;
    }

    public Limit getSignal() {
        return signal;
    }

    public void setSignal(Limit signal) {
        this.signal = signal;
    }

    public Limit getGameAction() {
        return gameAction;
    }

    public void setGameAction(Limit gameAction) {
        this.gameAction = gameAction;
    }

    public Limit getJoin() {
        return join;
    }

    public void setJoin(Limit join) {
        this.join = join;
    }

    public Limit getRoomCreation() {
        return roomCreation;
    }

    public void setRoomCreation(Limit roomCreation) {
        this.roomCreation = roomCreation;
    }

    public Limit getMessageFlood() {
        return messageFlood;
    }

    public void setMessageFlood(Limit messageFlood) {
        this.messageFlood = messageFlood;
    }

    public static final class Limit {
        private int limit;
        private long windowMs;

        public Limit() {
        }

        public Limit(int limit, long windowMs) {
            this.limit = limit;
            this.windowMs = windowMs;
        }

        public int getLimit() {
            return limit;
        }

        public void setLimit(int limit) {
            this.limit = limit;
        }

        public long getWindowMs() {
            return windowMs;
        }

        public void setWindowMs(long windowMs) {
            this.windowMs = windowMs;
        }
    }
}
