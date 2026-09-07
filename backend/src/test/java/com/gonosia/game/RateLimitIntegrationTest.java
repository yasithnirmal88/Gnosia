package com.gonosia.game;

import com.gonosia.game.model.Phase;
import com.gonosia.game.model.Role;
import com.gonosia.game.model.Room;
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
 * Application-level rate-limit tests against the real STOMP stack. This class uses
 * its own Spring context with compact windows/limits so burst and sustained-spam
 * behaviour is deterministic and fast. The limits here are deliberately low; they
 * only model behaviour and are not the production defaults.
 *
 * Every test resets the shared in-memory buckets first because all test clients
 * share the loopback IP and the counters are a JVM-wide singleton.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "app.rate-limit.enabled=true",
        "app.rate-limit.chat.limit=3", "app.rate-limit.chat.window-ms=1000",
        "app.rate-limit.dm.limit=3", "app.rate-limit.dm.window-ms=1000",
        "app.rate-limit.gnosia-chat.limit=3", "app.rate-limit.gnosia-chat.window-ms=1000",
        "app.rate-limit.signal.limit=5", "app.rate-limit.signal.window-ms=1000",
        "app.rate-limit.game-action.limit=3", "app.rate-limit.game-action.window-ms=1000",
        "app.rate-limit.join.limit=20", "app.rate-limit.join.window-ms=10000",
        "app.rate-limit.room-creation.limit=3", "app.rate-limit.room-creation.window-ms=5000",
        "app.rate-limit.message-flood.limit=40", "app.rate-limit.message-flood.window-ms=1000"
})
class RateLimitIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired private RoomManager roomManager;
    @Autowired private GameService gameService;
    @Autowired private SessionIdentityService identityService;
    @Autowired private RateLimitService rateLimitService;

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

    private void startGame(PassThroughStomp creator, String code) throws Exception {
        creator.session.send("/app/room/" + code + "/start", Map.of());
        awaitPhase(code, Phase.INTRO);
        room(code).getGameState().setRemainingTimeSeconds(3600);
    }

    private Room awaitPhase(String code, Phase phase) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            Room r = roomManager.getRoom(code);
            if (r != null && r.getGameState().getPhase() == phase) return r;
            Thread.sleep(20);
        }
        throw new AssertionError("Room " + code + " never reached " + phase);
    }

    private void advance(String code) {
        Room r = room(code);
        gameService.transitionPhase(r);
        if (r.getGameState().getPhase() != Phase.LOBBY && r.getGameState().getPhase() != Phase.GAME_OVER) {
            r.getGameState().setRemainingTimeSeconds(3600);
        }
    }

    private void setRole(String code, String playerId, Role role) {
        room(code).getPlayer(playerId).setRole(role);
    }

    /** Five-member started room (INTRO), members returned in order. */
    private PassThroughStomp[] startedRoom(String prefix, String code, String pin) throws Exception {
        PassThroughStomp a = newClient(prefix + "-a", "key-" + prefix + "-a001");
        createRoom(a, code, pin);
        PassThroughStomp b = newClient(prefix + "-b", "key-" + prefix + "-b001");
        PassThroughStomp c = newClient(prefix + "-c", "key-" + prefix + "-c001");
        PassThroughStomp d = newClient(prefix + "-d", "key-" + prefix + "-d001");
        PassThroughStomp e = newClient(prefix + "-e", "key-" + prefix + "-e001");
        for (PassThroughStomp p : new PassThroughStomp[]{b, c, d, e}) joinRoom(p, code, pin);
        startGame(a, code);
        return new PassThroughStomp[]{a, b, c, d, e};
    }

    // ─── CHAT ─────────────────────────────────────────────────────────────

    @Test
    void chatNormalTrafficAllowed() throws Exception {
        String code = "NORM";
        PassThroughStomp[] all = startedRoom("nm", code, "1111");
        PassThroughStomp a = all[0], b = all[1];
        b.subscribeRoomChat(code);
        a.session.send("/app/room/" + code + "/chat", Map.of("content", "one"));
        a.session.send("/app/room/" + code + "/chat", Map.of("content", "two"));
        int delivered = b.countChat(2000);
        assertThat(delivered).isEqualTo(2);
    }

    @Test
    void chatBurstThrottled() throws Exception {
        String code = "BRST";
        PassThroughStomp[] all = startedRoom("bu", code, "2222");
        PassThroughStomp a = all[0], b = all[1];
        b.subscribeRoomChat(code);
        // Burst 6 within the 3-per-second window: 3 delivered, 3 dropped by the
        // chat flood guard (well under the catch-all message budget).
        for (int i = 0; i < 6; i++) {
            a.session.send("/app/room/" + code + "/chat", Map.of("content", "msg" + i));
        }
        int delivered = b.countChat(1500);
        assertThat(delivered).isEqualTo(3);
    }

    @Test
    void chatSustainedSpamRefillsAfterWindow() throws Exception {
        String code = "SUST";
        PassThroughStomp[] all = startedRoom("ss", code, "3333");
        PassThroughStomp a = all[0], b = all[1];
        b.subscribeRoomChat(code);
        for (int i = 0; i < 3; i++) {
            a.session.send("/app/room/" + code + "/chat", Map.of("content", "burst-" + i));
        }
        assertThat(b.countChat(1500)).isEqualTo(3);
        // Window rolls over, the budget refills and a sustained spammer can send again.
        Thread.sleep(1200);
        for (int i = 0; i < 2; i++) {
            a.session.send("/app/room/" + code + "/chat", Map.of("content", "after-" + i));
        }
        assertThat(b.countChat(1500)).isEqualTo(2);
    }

    @Test
    void roomWideChatBudgetCapsCrossPlayerTraffic() throws Exception {
        String code = "PLYR";
        PassThroughStomp[] all = startedRoom("pl", code, "4444");
        PassThroughStomp a = all[0], b = all[1], c = all[2];
        b.subscribeRoomChat(code);
        // a fills the room-wide chat budget (3 per second) exactly.
        for (int i = 0; i < 3; i++) {
            a.session.send("/app/room/" + code + "/chat", Map.of("content", "a-" + i));
        }
        Thread.sleep(200);
        // c is a different player/session with its own untouched budget, yet its
        // message must still be dropped: the shared room bucket is already full.
        // This proves the room-level scope — not per-player capping — is what
        // throttles traffic for this room in this window.
        c.session.send("/app/room/" + code + "/chat", Map.of("content", "from-c"));
        int delivered = b.countChat(2000);
        assertThat(delivered).isEqualTo(3);
    }

    @Test
    void separateRoomsHaveIndependentChatLimits() throws Exception {
        String codeA = "RMA1";
        String codeB = "RMB1";
        PassThroughStomp[] allA = startedRoom("ra", codeA, "5555");
        PassThroughStomp[] allB = startedRoom("rb", codeB, "6666");
        PassThroughStomp a = allA[0];       // in room A
        PassThroughStomp b = allB[0];       // in room B
        a.subscribeRoomChat(codeA);
        b.subscribeRoomChat(codeB);
        // Flood room A.
        for (int i = 0; i < 4; i++) {
            a.session.send("/app/room/" + codeA + "/chat", Map.of("content", "a-" + i));
        }
        Thread.sleep(200);
        // Room B's bucket is independent — the message must arrive.
        b.session.send("/app/room/" + codeB + "/chat", Map.of("content", "room-b"));
        assertThat(a.countChat(1500)).isEqualTo(3);
        assertThat(b.countChat(2000)).isEqualTo(1);
    }

    // ─── DM ───────────────────────────────────────────────────────────────

    @Test
    void dmBurstThrottled() throws Exception {
        String code = "DMBB";
        PassThroughStomp[] all = startedRoom("db", code, "7777");
        PassThroughStomp a = all[0], b = all[1];
        for (int i = 0; i < 6; i++) {
            a.session.send("/app/room/" + code + "/dm",
                    Map.of("targetId", "db-b", "content", "dm-" + i));
        }
        assertThat(b.countType("DM", 1500)).isEqualTo(3);
    }

    // ─── SIGNAL ───────────────────────────────────────────────────────────

    @Test
    void signalFloodThrottled() throws Exception {
        String code = "SGFL";
        PassThroughStomp[] all = startedRoom("sf", code, "8888");
        PassThroughStomp a = all[0], b = all[1];
        for (int i = 0; i < 8; i++) {
            a.session.send("/app/room/" + code + "/signal",
                    Map.of("targetId", "sf-b", "type", "OFFER", "sdp", "sdp-" + i));
        }
        int received = b.countType("SIGNAL", 1500);
        assertThat(received).isBetween(1, 5);
    }

    // ─── RECONNECT / JOIN FLOOD ───────────────────────────────────────────

    @Test
    void reconnectFloodThrottled() throws Exception {
        String code = "RCFL";
        PassThroughStomp a = newClient("rc-a", "key-rc-a001");
        createRoom(a, code, "9999");
        // One session hammers the join endpoint 25 times. Join/session budget is
        // 20 per 10s, so at most 20 JOIN_CONFIRMED responses can arrive.
        for (int i = 0; i < 25; i++) {
            a.session.send("/app/room/" + code + "/join",
                    Map.of("id", "rc-a", "channelKey", "key-rc-a001", "pin", "9999"));
        }
        int confirmed = a.countType("JOIN_CONFIRMED", 2000);
        assertThat(confirmed).isBetween(20, 21);
    }

    // ─── ROOM CREATION (NO MUTATION ON REJECT) ────────────────────────────

    @Test
    void roomCreationLimitedAndRejectedDoesNotCreateRoom() throws Exception {
        // One player identity can only ever belong to a single room, so each room
        // creation attempt uses a fresh session/player. They all share the loopback
        // IP, which is what the room-creation budget (3 per 5s) is scoped to.
        PassThroughStomp c1 = newClient("rcm-1", "key-rcm-001");
        PassThroughStomp c2 = newClient("rcm-2", "key-rcm-002");
        PassThroughStomp c3 = newClient("rcm-3", "key-rcm-003");
        PassThroughStomp c4 = newClient("rcm-4", "key-rcm-004");
        createRoom(c1, "RCM1", "1111");
        createRoom(c2, "RCM2", "2222");
        createRoom(c3, "RCM3", "3333");
        // 4th attempt within the 5s window: the IP budget is exhausted, so the
        // request must be dropped BEFORE any room is created.
        c4.session.send("/app/room/create",
                Map.of("playerId", "rcm-4", "channelKey", "key-rcm-004",
                        "roomCode", "RCM4", "participants", 5, "pin", "4444"));
        Thread.sleep(300);
        assertThat(roomManager.getRoom("RCM1")).isNotNull();
        assertThat(roomManager.getRoom("RCM2")).isNotNull();
        assertThat(roomManager.getRoom("RCM3")).isNotNull();
        assertThat(roomManager.getRoom("RCM4")).isNull();
    }

    // ─── GAME ACTION (ROOM SCOPE, NO STATE MUTATION ON REJECT) ────────────

    @Test
    void gameActionRoomScopeDropsBeyondBudgetWithoutMutation() throws Exception {
        String code = "GANO";
        PassThroughStomp[] all = startedRoom("ga", code, "1234");
        PassThroughStomp a = all[0], b = all[1], c = all[2], d = all[3], e = all[4];
        String[] ids = {"ga-a", "ga-b", "ga-c", "ga-d", "ga-e"};
        for (String id : ids) setRole(code, id, Role.HUMAN);

        advance(code); // INTRO → DISCUSSION
        advance(code); // DISCUSSION → VOTING

        // Votes are sent sequentially (not concurrently) so recording order is
        // deterministic. The game-action budget for the room is 3 per second and
        // the START action already consumed one slot, so exactly the first two
        // votes are recorded; the remaining three must be dropped BEFORE they
        // mutate state (no currentVotes/playerActionDone entries appear).
        PassThroughStomp[] voters = {a, b, c, d, e};
        for (PassThroughStomp v : voters) {
            v.session.send("/app/room/" + code + "/vote", Map.of("targetId", "ga-a"));
            Thread.sleep(60);
        }
        Thread.sleep(500);

        assertThat(room(code).getGameState().getCurrentVotes()).containsOnlyKeys("ga-a", "ga-b");
        assertThat(room(code).getGameState().getPlayerActionDone()).containsOnlyKeys("ga-a", "ga-b");
    }

    // ─── STOMP plumbing ───────────────────────────────────────────────────

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

        void subscribeRoomChat(String code) {
            session.subscribe("/topic/room/" + code + "/chat", new StompFrameHandler() {
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

        Map<String, Object> await(String type) throws Exception {
            long deadline = System.currentTimeMillis() + 8000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(500, TimeUnit.MILLISECONDS);
                if (msg != null && type.equals(msg.get("type"))) return msg;
            }
            throw new AssertionError("Timed out waiting for " + type + " on player " + playerId);
        }

        int countType(String type, long ms) throws Exception {
            int count = 0;
            long deadline = System.currentTimeMillis() + ms;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(200, TimeUnit.MILLISECONDS);
                if (msg != null && type.equals(msg.get("type"))) count++;
            }
            return count;
        }

        int countChat(long ms) throws Exception {
            int count = 0;
            long deadline = System.currentTimeMillis() + ms;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(200, TimeUnit.MILLISECONDS);
                if (msg != null && msg.containsKey("content") && msg.containsKey("senderId")) count++;
            }
            return count;
        }
    }
}