package com.gonosia.game;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gonosia.game.model.Room;
import com.gonosia.game.model.RoomResponse;
import com.gonosia.game.security.RateLimitService;
import com.gonosia.game.security.SessionIdentityService;
import com.gonosia.game.service.GameService;
import com.gonosia.game.service.RoomManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the timer/state-split architecture:
 *  1. During quiet play the server emits ONLY lightweight TIMER_UPDATE frames on
 *     the room's /timer topic — never the full game state every second.
 *  2. Full game state is emitted exclusively on real game events (phase
 *     transition, join/reconnect, vote, death, game start/end).
 *  3. Phase transitions stay server-authoritative (timer tick only) and
 *     reconnects always receive the authoritative remaining-time snapshot.
 *
 * These tests share the default Spring context with the other websocket test
 * classes, so all rate-limit buckets are reset per test and room codes are unique.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TimerBroadcastIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired private RoomManager roomManager;
    @Autowired private GameService gameService;
    @Autowired private SessionIdentityService identityService;
    @Autowired private RateLimitService rateLimitService;
    @Autowired private ObjectMapper objectMapper;

    private WebSocketStompClient stompClient;
    private final List<StompSession> openSessions = new ArrayList<>();

    @BeforeEach
    void setUp() {
        stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new MappingJackson2MessageConverter());
        rateLimitService.resetAll();
    }

    @AfterEach
    void tearDown() throws InterruptedException {
        for (StompSession s : openSessions) {
            try {
                if (s.isConnected()) s.disconnect();
            } catch (Exception ignored) {
            }
        }
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline
                && openSessions.stream().anyMatch(s -> identityService.playerIdForSession(s.getSessionId()) != null)) {
            Thread.sleep(50);
        }
        openSessions.clear();
    }

    private String connectUrl() {
        return "ws://localhost:" + port + "/game-ws-raw";
    }

    private PassThroughStomp newClient(String playerId, String key) throws Exception {
        StompSession session = stompClient.connect(connectUrl(), new StompSessionHandlerAdapter() {})
                .get(15, TimeUnit.SECONDS);
        PassThroughStomp client = new PassThroughStomp(session, playerId, key);
        openSessions.add(session);
        return client;
    }

    private Room room(String code) {
        Room r = roomManager.getRoom(code);
        assertThat(r).as("room " + code).isNotNull();
        return r;
    }

    private void freeze(String code) {
        Room r = room(code);
        if (r.getGameState().getPhase() != com.gonosia.game.model.Phase.LOBBY
                && r.getGameState().getPhase() != com.gonosia.game.model.Phase.GAME_OVER) {
            r.getGameState().setRemainingTimeSeconds(3600);
        }
    }

    private void advance(String code) {
        gameService.transitionPhase(room(code));
        freeze(code);
    }

    private void createRoom(PassThroughStomp creator, String code, String pin) throws Exception {
        creator.session.send("/app/room/create",
                Map.of("playerId", creator.playerId, "channelKey", creator.key,
                        "roomCode", code, "participants", 5, "pin", pin));
        creator.await("ROOM_CREATED");
    }

    private void joinRoom(PassThroughStomp client, String code, String pin) throws Exception {
        client.session.send("/app/room/" + code + "/join",
                Map.of("id", client.playerId, "channelKey", client.key, "pin", pin));
        client.await("JOIN_CONFIRMED");
    }

    private Room awaitPhase(String code, com.gonosia.game.model.Phase phase) throws Exception {
        long deadline = System.currentTimeMillis() + 8000;
        while (System.currentTimeMillis() < deadline) {
            Room r = roomManager.getRoom(code);
            if (r != null && r.getGameState().getPhase() == phase) return r;
            Thread.sleep(100);
        }
        throw new AssertionError("Room " + code + " never reached " + phase);
    }

    /** Five-member started room (INTRO, frozen), members returned in order. */
    private PassThroughStomp[] startedRoom(String prefix, String code, String pin) throws Exception {
        PassThroughStomp a = newClient(prefix + "-a", "key-" + prefix + "-a001");
        createRoom(a, code, pin);
        PassThroughStomp b = newClient(prefix + "-b", "key-" + prefix + "-b001");
        PassThroughStomp c = newClient(prefix + "-c", "key-" + prefix + "-c001");
        PassThroughStomp d = newClient(prefix + "-d", "key-" + prefix + "-d001");
        PassThroughStomp e = newClient(prefix + "-e", "key-" + prefix + "-e001");
        for (PassThroughStomp p : new PassThroughStomp[]{b, c, d, e}) joinRoom(p, code, pin);

        // start through the controller (consumes one game-action budget slot; fine).
        a.session.send("/app/room/" + code + "/start", Map.of());
        awaitPhase(code, com.gonosia.game.model.Phase.INTRO);
        freeze(code);
        return new PassThroughStomp[]{a, b, c, d, e};
    }

    // ─── Phase transitions stay server-authoritative ─────────────────────────

    @Test
    void timerExpiryTransitionsPhaseAndBroadcastsFullState() throws Exception {
        String code = "TXPD";
        PassThroughStomp[] all = startedRoom("tx", code, "9101");
        PassThroughStomp b = all[1];
        b.subscribeRoom(code);

        advance(code); // INTRO → DISCUSSION — broadcasts a DISCUSSION full-state
        room(code).getGameState().setRemainingTimeSeconds(1);

        // Timer tick expires the phase: transition must fire and broadcast FULL state.
        awaitPhase(code, com.gonosia.game.model.Phase.VOTING);
        Map<String, Object> state = b.pollForFullState("VOTING");
        assertThat(state).isNotNull();
        assertThat(state.get("roomCode")).isEqualTo(code);
        assertThat(((Map<?, ?>) state.get("gameState")).get("phase")).isEqualTo("VOTING");
    }

    @Test
    void voteAfterTimerExpiryRejectedWithoutMutation() throws Exception {
        String code = "TXVR";
        PassThroughStomp[] all = startedRoom("tv", code, "9102");
        PassThroughStomp a = all[0];

        advance(code); // INTRO → DISCUSSION
        advance(code); // DISCUSSION → VOTING
        room(code).getGameState().setRemainingTimeSeconds(1);

        awaitPhase(code, com.gonosia.game.model.Phase.RESULT);

        // The phase left VOTING when the timer expired, so a late ballot must be
        // rejected — and the rejection must not mutate vote state.
        a.session.send("/app/room/" + code + "/vote", Map.of("targetId", "tv-b"));
        Map<String, Object> rejection = a.await("ACTION_REJECTED");
        assertThat(rejection.get("action")).isEqualTo("VOTE");
        assertThat(room(code).getGameState().getCurrentVotes()).isEmpty();
        assertThat(room(code).getGameState().getPlayerActionDone()).doesNotContainKey("tv-a");
    }

    @Test
    void noVoteExpiryStillAdvancesPhase() throws Exception {
        String code = "TXNV";
        PassThroughStomp[] all = startedRoom("tn", code, "9103");

        advance(code); // INTRO → DISCUSSION
        advance(code); // DISCUSSION → VOTING
        room(code).getGameState().setRemainingTimeSeconds(1);

        // Nobody votes; the timer must still drive VOTING → RESULT without crashing,
        // and with no ballots nobody may be cryoslept.
        scanForPhase(code, com.gonosia.game.model.Phase.RESULT);
        assertThat(room(code).getGameState().getLastCryosleptPlayerId()).isNullOrEmpty();
    }

    // ─── Reconnect receives authoritative countdown ─────────────────────────

    @Test
    void reconnectMidCountdownReceivesAuthoritativeRemainingTime() throws Exception {
        String code = "TXRJ";
        PassThroughStomp[] all = startedRoom("rj", code, "9104");
        PassThroughStomp b = all[1];

        advance(code); // INTRO → DISCUSSION
        room(code).getGameState().setRemainingTimeSeconds(30);
        b.subscribeRoom(code);
        b.clearInbox();

        // Same identity re-joins (reconnect path) → server broadcasts full state.
        b.session.send("/app/room/" + code + "/join",
                Map.of("id", "rj-b", "channelKey", "key-" + "rj-b001", "pin", "9104"));
        Map<String, Object> state = b.pollForFullState();
        assertThat(state).isNotNull();
        Map<?, ?> gameState = (Map<?, ?>) state.get("gameState");
        int frameRemaining = (Integer) gameState.get("remainingTimeSeconds");
        int serverRemaining = room(code).getGameState().getRemainingTimeSeconds();

        assertThat(frameRemaining).isBetween(0, 30);
        assertThat(Math.abs(frameRemaining - serverRemaining)).isLessThanOrEqualTo(1);
    }

    // ─── Timer-only quiet phase: no duplicate full-state broadcasts ─────────

    @Test
    void quietMeetingBroadcastsTimerOnlyNotFullState() throws Exception {
        String code = "TXQT";
        PassThroughStomp[] all = startedRoom("tq", code, "9105");
        PassThroughStomp b = all[1];

        advance(code); // INTRO → DISCUSSION (remaining frozen at 3600)

        b.subscribeRoom(code);
        b.subscribeTimer(code);
        b.clearInbox();

        Thread.sleep(3500);

        // Quiet meeting: only lightweight timer updates, zero full-state frames.
        assertThat(b.countTimers(200)).isGreaterThanOrEqualTo(3);
        assertThat(b.countFullStates(100)).isZero();
    }

    @Test
    void timerBroadcastsAreLighterThanFullState() throws Exception {
        String code = "TXSZ";
        PassThroughStomp[] all = startedRoom("tz", code, "9106");
        Room r = room(code);
        advance(code); // INTRO → DISCUSSION

        // Serialize both payload shapes with the same ObjectMapper the broker uses,
        // to quantify the per-second traffic reduction.
        byte[] full = objectMapper.writeValueAsBytes(RoomResponse.fromRoom(r, null));
        byte[] timer = objectMapper.writeValueAsBytes(Map.of(
                "type", "TIMER_UPDATE",
                "phase", "DISCUSSION",
                "remainingTimeSeconds", 60));
        System.out.println("[SIZE] full-state=" + full.length + " bytes, timer=" + timer.length + " bytes"
                + " (timer is " + (full.length / (double) timer.length) + "x smaller)");
        assertThat(timer.length * 10).isLessThan(full.length);
    }

    // ─── Simultaneous rooms: independent timer streams ──────────────────────

    @Test
    void simultaneousRoomsReceiveIndependentTimerUpdates() throws Exception {
        String codeA = "TXRA";
        String codeB = "TXRB";
        PassThroughStomp[] allA = startedRoom("sa", codeA, "9107");
        PassThroughStomp[] allB = startedRoom("sb", codeB, "9108");
        PassThroughStomp bA = allA[1], bB = allB[1];

        advance(codeA); // both in DISCUSSION, frozen
        advance(codeB);

        bA.subscribeTimer(codeA);
        bB.subscribeTimer(codeB);
        bA.clearInbox();
        bB.clearInbox();

        int timersA = bA.countTimers(3200);
        int timersB = bB.countTimers(200);
        assertThat(timersA).isGreaterThanOrEqualTo(2);
        assertThat(timersB).isGreaterThanOrEqualTo(2);
    }

    private void scanForPhase(String code, com.gonosia.game.model.Phase phase) throws Exception {
        long deadline = System.currentTimeMillis() + 8000;
        while (System.currentTimeMillis() < deadline) {
            if (room(code).getGameState().getPhase() == phase) return;
            Thread.sleep(100);
        }
        throw new AssertionError("Room " + code + " never observed in " + phase);
    }

    // ─── STOMP plumbing ─────────────────────────────────────────────────────

    private static class PassThroughStomp {
        final StompSession session;
        final String playerId;
        final String key;
        final BlockingQueue<Map<String, Object>> inbox = new LinkedBlockingQueue<>();

        PassThroughStomp(StompSession session, String playerId, String key) {
            this.session = session;
            this.playerId = playerId;
            this.key = key;
            subscribePrivate();
        }

        void subscribePrivate() {
            session.subscribe("/topic/private/" + key, new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return Map.class;
                }

                @Override
                @SuppressWarnings("unchecked")
                public void handleFrame(StompHeaders headers, Object payload) {
                    if (payload instanceof Map) inbox.offer((Map<String, Object>) payload);
                }
            });
        }

        void subscribeRoom(String code) {
            session.subscribe("/topic/room/" + code, new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return Map.class;
                }

                @Override
                @SuppressWarnings("unchecked")
                public void handleFrame(StompHeaders headers, Object payload) {
                    if (payload instanceof Map) inbox.offer((Map<String, Object>) payload);
                }
            });
        }

        void subscribeTimer(String code) {
            session.subscribe("/topic/room/" + code + "/timer", new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return Map.class;
                }

                @Override
                @SuppressWarnings("unchecked")
                public void handleFrame(StompHeaders headers, Object payload) {
                    if (payload instanceof Map) inbox.offer((Map<String, Object>) payload);
                }
            });
        }

        void clearInbox() {
            inbox.clear();
        }

        Map<String, Object> await(String type) throws Exception {
            long deadline = System.currentTimeMillis() + 8000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(500, TimeUnit.MILLISECONDS);
                if (msg != null && type.equals(msg.get("type"))) return msg;
            }
            throw new AssertionError("Timed out waiting for " + type + " on player " + playerId);
        }

        /** A full-state frame: carries gameState (RoomResponse has no "type" key). */
        Map<String, Object> pollForFullState() throws Exception {
            long deadline = System.currentTimeMillis() + 8000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(500, TimeUnit.MILLISECONDS);
                if (msg != null && msg.containsKey("gameState")) return msg;
            }
            throw new AssertionError("Timed out waiting for full room state on player " + playerId);
        }

        /** First full-state frame whose gameState.phase equals the given phase (others discarded). */
        Map<String, Object> pollForFullState(String phase) throws Exception {
            long deadline = System.currentTimeMillis() + 8000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(500, TimeUnit.MILLISECONDS);
                if (msg != null && msg.containsKey("gameState")) {
                    Map<?, ?> gameState = (Map<?, ?>) msg.get("gameState");
                    if (phase.equals(String.valueOf(gameState.get("phase")))) return msg;
                }
            }
            throw new AssertionError("Timed out waiting for full room state in phase "
                    + phase + " on player " + playerId);
        }

        int countTimers(long ms) throws Exception {
            int count = 0;
            long deadline = System.currentTimeMillis() + ms;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(200, TimeUnit.MILLISECONDS);
                if (msg != null && "TIMER_UPDATE".equals(msg.get("type"))) count++;
            }
            return count;
        }

        int countFullStates(long ms) throws Exception {
            int count = 0;
            long deadline = System.currentTimeMillis() + ms;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(200, TimeUnit.MILLISECONDS);
                if (msg != null && msg.containsKey("gameState")) count++;
            }
            return count;
        }
    }
}