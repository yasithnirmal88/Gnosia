package com.gonosia.game.support;

import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Lightweight STOMP test harness for the {@code /game-ws-raw} WebSocket
 * endpoint. Each test method that opens STOMP sessions should create its own
 * {@link Stomp} pool to avoid session leaks between tests.
 *
 * <p>Typical lifecycle inside a {@code @SpringBootTest(RANDOM_PORT)} test:
 * <pre>{@code
 * Stomp pool = new Stomp("ws://localhost:" + port + "/game-ws-raw");
 * Stomp.Client a = pool.connect("a1", "key-a1");
 * a.subscribeRoom("CODE");
 * a.subscribePrivate();
 * a.clearInbox();
 * a.send("/app/room/...", Map.of(...));
 * Map<String,Object> frame = a.awaitPrivate("JOIN_CONFIRMED");
 * pool.shutdown();
 * }</pre>
 *
 * <p>Origin: extracted from {@code RoomLifecycleIntegrationTest.PassThroughStomp}
 * (379 L) and extended to cover all subscriber shapes (room/timer/chat/events)
 * without duplicating per test class.
 */
public final class Stomp {

    private final WebSocketStompClient client;
    private final String url;
    private final List<StompSession> open = new ArrayList<>();
    private final AtomicInteger privateSubCount = new AtomicInteger();

    public Stomp(String url) {
        WebSocketStompClient c = new WebSocketStompClient(new StandardWebSocketClient());
        c.setMessageConverter(new MappingJackson2MessageConverter());
        this.client = c;
        this.url = url;
    }

    /** Open a new socket, subscribe the private channel, and return the harness. */
    public Client connect(String playerId, String channelKey) {
        try {
            StompSession session = client.connect(url, new StompSessionHandlerAdapter() {}).get(15, TimeUnit.SECONDS);
            open.add(session);
            return new Client(session, playerId, channelKey);
        } catch (Exception e) {
            throw new IllegalStateException("STOMP connect failed: " + e.getMessage(), e);
        }
    }

    /** Disconnect all sessions opened by this pool. */
    public void shutdown() {
        for (StompSession s : open) {
            try { if (s.isConnected()) s.disconnect(); } catch (Exception ignored) {}
        }
        open.clear();
    }

    public int privateSubCount() { return privateSubCount.get(); }

    // ─── Per-player client ────────────────────────────────────────────────

    public class Client {
        private final StompSession session;
        private final String playerId;
        private final String key;
        private final BlockingQueue<Map<String, Object>> inbox = new LinkedBlockingQueue<>();

        Client(StompSession session, String playerId, String key) {
            this.session = session;
            this.playerId = playerId;
            this.key = key;
            subscribePrivate();
        }

        public String playerId() { return playerId; }
        public String key()        { return key; }
        public StompSession session() { return session; }

        // ─── Subscription helpers ─────────────────────────────────────────

        public void subscribePrivate() {
            privateSubCount.incrementAndGet();
            session.subscribe("/topic/private/" + key, queueHandler());
        }

        public void subscribeRoom(String code) {
            session.subscribe("/topic/room/" + code, queueHandler());
        }

        public void subscribeTimer(String code) {
            session.subscribe("/topic/room/" + code + "/timer", queueHandler());
        }

        public void subscribeChat(String code) {
            session.subscribe("/topic/room/" + code + "/chat", queueHandler());
        }

        public void subscribeEvents(String code) {
            session.subscribe("/topic/room/" + code + "/events", queueHandler());
        }

        // ─── Send ─────────────────────────────────────────────────────────

        public void send(String dest, Object body) { session.send(dest, body); }

        // ─── Inbox ────────────────────────────────────────────────────────

        public void clearInbox() { inbox.clear(); }

        /**
         * Block until a private frame whose <code>type</code> field matches,
         * then return that frame's payload. Throws on 8 s timeout.
         */
        public Map<String, Object> await(String expectedType) throws InterruptedException {
            long deadline = System.currentTimeMillis() + 8000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(500, TimeUnit.MILLISECONDS);
                if (msg != null && expectedType.equals(msg.get("type"))) return msg;
            }
            throw new AssertionError("Timed out waiting for private frame type '" + expectedType
                    + "' on player " + playerId);
        }

        /**
         * Poll the inbox for any frame carrying a {@code gameState} field
         * (i.e. a full RoomResponse). Discards non-matching frames. Timeout
         * is 8 s.
         */
        public Map<String, Object> pollForFullState() throws InterruptedException {
            long deadline = System.currentTimeMillis() + 8000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(500, TimeUnit.MILLISECONDS);
                if (msg != null && msg.containsKey("gameState")) return msg;
            }
            throw new AssertionError("Timed out waiting for full room state on " + playerId);
        }

        /**
         * Like {@link #pollForFullState()} but only accepts frames whose
         * <code>gameState.phase</code> equals the given phase name.
         */
        public Map<String, Object> pollForFullState(String phase) throws InterruptedException {
            long deadline = System.currentTimeMillis() + 8000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(500, TimeUnit.MILLISECONDS);
                if (msg != null && msg.containsKey("gameState")) {
                    Map<?, ?> gs = (Map<?, ?>) msg.get("gameState");
                    if (phase.equals(String.valueOf(gs.get("phase")))) return msg;
                }
            }
            throw new AssertionError("Timed out waiting for full room state in phase '"
                    + phase + "' on " + playerId);
        }

        /**
         * Consume the inbox for {@code ms} milliseconds and count how many
         * frames carried <code>type: TIMER_UPDATE</code>.
         */
        public int countTimers(long ms) throws InterruptedException {
            int count = 0;
            long deadline = System.currentTimeMillis() + ms;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(200, TimeUnit.MILLISECONDS);
                if (msg != null && "TIMER_UPDATE".equals(msg.get("type"))) count++;
            }
            return count;
        }

        /**
         * Consume the inbox for {@code ms} milliseconds and count how many
         * frames contained a {@code gameState} (full-room-state) field.
         */
        public int countFullStates(long ms) throws InterruptedException {
            int count = 0;
            long deadline = System.currentTimeMillis() + ms;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(200, TimeUnit.MILLISECONDS);
                if (msg != null && msg.containsKey("gameState")) count++;
            }
            return count;
        }

        // ─── Private ──────────────────────────────────────────────────────

        private StompFrameHandler queueHandler() {
            return new StompFrameHandler() {
                @Override public Type getPayloadType(StompHeaders h) { return Map.class; }
                @Override @SuppressWarnings("unchecked")
                public void handleFrame(StompHeaders h, Object p) {
                    if (p instanceof Map) inbox.offer((Map<String, Object>) p);
                }
            };
        }
    }
}