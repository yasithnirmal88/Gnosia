package com.gonosia.game;

import com.gonosia.game.model.Phase;
import com.gonosia.game.model.Room;
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
 * Lobby traversal protocol: host-only starting, the ready gate below capacity,
 * ready flags in the public state, and graceful leave with host reassignment.
 * Uses the production rate-limit defaults (each test rub room codes).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LobbyProtocolIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired private RoomManager roomManager;

    private WebSocketStompClient stompClient;
    private final List<StompSession> openSessions = new ArrayList<>();

    @BeforeEach
    void setUp() {
        stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new MappingJackson2MessageConverter());
    }

    @AfterEach
    void tearDown() throws InterruptedException {
        for (StompSession s : openSessions) {
            try {
                if (s.isConnected()) s.disconnect();
            } catch (Exception ignored) {
            }
        }
        Thread.sleep(100);
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

    private void createRoom(PassThroughStomp creator, String code, String pin, int participants) throws Exception {
        creator.subscribeRoom(code);
        creator.session.send("/app/room/create",
                Map.of("playerId", creator.playerId, "channelKey", creator.key,
                        "roomCode", code, "participants", participants, "pin", pin));
        creator.await("ROOM_CREATED");
    }

    private void joinRoom(PassThroughStomp client, String code, String pin) throws Exception {
        client.subscribeRoom(code);
        client.session.send("/app/room/" + code + "/join",
                Map.of("id", client.playerId, "channelKey", client.key, "pin", pin));
        client.await("JOIN_CONFIRMED");
    }

    private void setReady(PassThroughStomp client, String code, boolean ready) throws Exception {
        client.session.send("/app/room/" + code + "/ready", Map.of("ready", String.valueOf(ready)));
    }

    private void leave(PassThroughStomp client, String code) throws Exception {
        client.session.send("/app/room/" + code + "/leave", Map.of());
    }

    private void startGame(PassThroughStomp client, String code) throws Exception {
        client.session.send("/app/room/" + code + "/start", Map.of());
    }

    private void awaitPhase(String code, Phase phase) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            Room r = roomManager.getRoom(code);
            if (r != null && r.getGameState().getPhase() == phase) return;
            Thread.sleep(20);
        }
        throw new AssertionError("Room " + code + " never reached " + phase);
    }

    private Map<String, Object> awaitRoomState(PassThroughStomp client, java.util.function.Predicate<Map<String, Object>> match)
        throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            Map<String, Object> state = client.pollRoomState(200);
            if (state != null && match.test(state)) return state;
        }
        throw new AssertionError("Room state never matched the expected predicate");
    }

    private static boolean hasPlayerReady(Map<String, Object> state, String id, boolean ready) {
        Object players = state.get("players");
        if (!(players instanceof List<?> list)) return false;
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) continue;
            if (id.equals(m.get("id")) && ready == Boolean.TRUE.equals(m.get("ready"))) return true;
        }
        return false;
    }

    private void assertPlayerReady(String code, String playerId, boolean ready) {
        assertThat(room(code).getPlayer(playerId).isReady()).isEqualTo(ready);
    }

    // ─── HOST ONLY ─────────────────────────────────────────────────────────

    @Test
    void startIsHostOnly() throws Exception {
        String code = "HOST1";
        PassThroughStomp host = newClient("host-a", "key-host-a001");
        createRoom(host, code, "8181", 8);
        PassThroughStomp b = newClient("host-b", "key-host-b001");
        joinRoom(b, code, "8181");
        PassThroughStomp c = newClient("host-c", "key-host-c001");
        joinRoom(c, code, "8181");
        PassThroughStomp d = newClient("host-d", "key-host-d001");
        joinRoom(d, code, "8181");
        PassThroughStomp e = newClient("host-e", "key-host-e001");
        joinRoom(e, code, "8181");

        // Non-host start below capacity is denied and the phase stays put.
        startGame(b, code);
        Map<String, Object> rejection = b.await("ACTION_REJECTED");
        assertThat(rejection.get("action")).isEqualTo("START");
        assertThat(room(code).getGameState().getPhase()).isEqualTo(Phase.LOBBY);

        // The host can depart as soon as minimum crew have signalled ready.
        for (PassThroughStomp p : new PassThroughStomp[]{host, b, c, d, e}) setReady(p, code, true);
        startGame(host, code);
        awaitPhase(code, Phase.INTRO);
    }

    // ─── READY GATE ────────────────────────────────────────────────────────

    @Test
    void startBelowCapacityRequiresEveryoneReady() throws Exception {
        String code = "READY";
        PassThroughStomp a = newClient("rdy-a", "key-rdy-a001");
        createRoom(a, code, "1212", 8);
        PassThroughStomp b = newClient("rdy-b", "key-rdy-b001");
        joinRoom(b, code, "1212");
        PassThroughStomp c = newClient("rdy-c", "key-rdy-c001");
        joinRoom(c, code, "1212");
        PassThroughStomp d = newClient("rdy-d", "key-rdy-d001");
        joinRoom(d, code, "1212");
        PassThroughStomp e = newClient("rdy-e", "key-rdy-e001");
        joinRoom(e, code, "1212");

        setReady(a, code, true);
        setReady(b, code, true);
        // c, d and e stay yellow → the host start must be refused.
        setReady(e, code, true);

        startGame(a, code);
        a.await("ACTION_REJECTED");
        assertThat(room(code).getGameState().getPhase()).isEqualTo(Phase.LOBBY);

        setReady(c, code, true);
        setReady(d, code, true);
        startGame(a, code);
        awaitPhase(code, Phase.INTRO);
    }

    @Test
    void readyFlagsAreBroadcastInRoomState() throws Exception {
        String code = "RFLG";
        PassThroughStomp a = newClient("rfg-a", "key-rfg-a001");
        createRoom(a, code, "3232", 8);
        PassThroughStomp b = newClient("rfg-b", "key-rfg-b001");
        joinRoom(b, code, "3232");

        // The public state exposes ready flags, the host id and the PIN so the
        // lobby can render invites and readiness.
        Map<String, Object> state = awaitRoomState(a,
                s -> "rfg-a".equals(s.get("hostId")) && hasPlayerReady(s, "rfg-a", false));
        assertThat(state.get("pin")).isEqualTo("3232");
        List<?> players = asList(state.get("players"));
        assertThat(players).anySatisfy(p -> {
            Map<?, ?> m = (Map<?, ?>) p;
            assertThat(m.get("id")).isEqualTo("rfg-a");
            assertThat(m.get("ready")).isEqualTo(false);
        });

        setReady(a, code, true);
        Map<String, Object> updated = awaitRoomState(a, s -> hasPlayerReady(s, "rfg-a", true));
        List<?> updatedPlayers = asList(updated.get("players"));
        assertThat(updatedPlayers).anySatisfy(p -> {
            Map<?, ?> m = (Map<?, ?>) p;
            assertThat(m.get("id")).isEqualTo("rfg-a");
            assertThat(m.get("ready")).isEqualTo(true);
        });
    }

    // ─── LEAVE / HOST REASSIGNMENT ────────────────────────────────────────

    @Test
    void leaveRemovesPlayerAndReassignsHost() throws Exception {
        String code = "LEAV1";
        PassThroughStomp host = newClient("lv-a", "key-lv-a001");
        createRoom(host, code, "6363", 8);
        PassThroughStomp b = newClient("lv-b", "key-lv-b001");
        joinRoom(b, code, "6363");
        PassThroughStomp c = newClient("lv-c", "key-lv-c001");
        joinRoom(c, code, "6363");

        leave(b, code);
        Thread.sleep(300);
        assertThat(room(code).getPlayer("lv-b")).isNull();
        assertThat(room(code).getPlayers()).hasSize(2);

        // Host leaves → the next connected member inherits the vessel.
        leave(host, code);
        Thread.sleep(300);
        assertThat(room(code).getPlayer("lv-a")).isNull();
        assertThat(room(code).getHostId()).isEqualTo("lv-c");
    }

    @Test
    void leaveByLastPlayerRemovesRoom() throws Exception {
        String code = "LEAV2";
        PassThroughStomp host = newClient("lv2-a", "key-lv2-a001");
        createRoom(host, code, "7373", 8);

        leave(host, code);
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline && roomManager.getRoom(code) != null) {
            Thread.sleep(20);
        }
        assertThat(roomManager.getRoom(code)).isNull();
    }

    private static List<?> asList(Object value) {
        return value instanceof List<?> list ? list : new ArrayList<>(0);
    }

    private static class PassThroughStomp {
        final StompSession session;
        final String playerId;
        final String key;
        final BlockingQueue<Map<String, Object>> inbox = new LinkedBlockingQueue<>();
        final BlockingQueue<Map<String, Object>> roomInbox = new LinkedBlockingQueue<>();

        PassThroughStomp(StompSession session, String playerId, String key) {
            this.session = session;
            this.playerId = playerId;
            this.key = key;
            subscribePrivate();
        }

        void subscribePrivate() {
            session.subscribe("/topic/private/" + key, frameHandler(inbox));
        }

        void subscribeRoom(String code) {
            session.subscribe("/topic/room/" + code, frameHandler(roomInbox));
        }

        private StompFrameHandler frameHandler(BlockingQueue<Map<String, Object>> queue) {
            return new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return Map.class;
                }

                @Override
                @SuppressWarnings("unchecked")
                public void handleFrame(StompHeaders headers, Object payload) {
                    if (payload instanceof Map) queue.offer((Map<String, Object>) payload);
                }
            };
        }

        Map<String, Object> pollRoomState(long timeoutMs) throws Exception {
            long deadline = System.currentTimeMillis() + timeoutMs;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = roomInbox.poll(timeoutMs, TimeUnit.MILLISECONDS);
                if (msg != null) return msg;
            }
            return null;
        }

        Map<String, Object> await(String type) throws Exception {
            long deadline = System.currentTimeMillis() + 8000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(500, TimeUnit.MILLISECONDS);
                if (msg != null && type.equals(msg.get("type"))) return msg;
            }
            throw new AssertionError("Timed out waiting for " + type + " on player " + playerId);
        }
    }
}