package com.gonosia.game;

import com.gonosia.game.model.Phase;
import com.gonosia.game.model.Room;
import com.gonosia.game.model.Role;
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

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class WebSocketAuthIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired private RoomManager roomManager;
    @Autowired private GameService gameService;
    @Autowired private SessionIdentityService identityService;

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
        openSessions.add(session);
        return new PassThroughStomp(session, playerId, key);
    }

    private Room room(String code) {
        Room room = roomManager.getRoom(code);
        assertThat(room).as("room " + code).isNotNull();
        return room;
    }

    private void freeze(String code) {
        Room r = room(code);
        if (r.getGameState().getPhase() != Phase.LOBBY && r.getGameState().getPhase() != Phase.GAME_OVER) {
            r.getGameState().setRemainingTimeSeconds(3600);
        }
    }

    private void advance(String code) {
        Room r = room(code);
        gameService.transitionPhase(r);
        freeze(code);
    }

    private Room awaitPhase(String code, Phase phase) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            Room r = roomManager.getRoom(code);
            if (r != null && r.getGameState().getPhase() == phase) return r;
            Thread.sleep(50);
        }
        throw new AssertionError("Room " + code + " never reached " + phase);
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
        Room r = awaitPhase(code, Phase.INTRO);
        r.getGameState().setRemainingTimeSeconds(3600);
    }

    private void setRoles(String code, Map<String, Role> roles) {
        Room r = room(code);
        r.getPlayers().forEach(p -> p.setRole(roles.get(p.getId())));
    }

    private void vote(PassThroughStomp client, String code, Map<String, String> body) {
        client.session.send("/app/room/" + code + "/vote", body);
    }

    @FunctionalInterface
    private interface Check {
        void run() throws Exception;
    }

    /** Re-run a state assertion until the asynchronously processed SEND lands, or fail with the last error. */
    private void awaitAssert(Check check) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        AssertionError last = null;
        while (System.currentTimeMillis() < deadline) {
            try {
                check.run();
                return;
            } catch (AssertionError e) {
                last = e;
                Thread.sleep(50);
            }
        }
        throw new AssertionError("Condition not met within 5s", last);
    }

    private Room setupWarp(String code, List<PassThroughStomp> players, Map<String, Role> roles,
            String votedOutId) throws Exception {
        startGame(players.get(0), code);
        setRoles(code, roles);
        advance(code); // INTRO → DISCUSSION
        advance(code); // DISCUSSION → VOTING
        for (PassThroughStomp p : players) {
            vote(p, code, Map.of("targetId", votedOutId));
        }
        awaitAssert(() -> {
            Room r = room(code);
            for (PassThroughStomp p : players) {
                assertThat(r.getGameState().getCurrentVotes()).containsKey(p.playerId);
            }
        });
        advance(code); // VOTING → RESULT
        advance(code); // RESULT → CRYOSLEEP
        advance(code); // CRYOSLEEP → WARP
        return room(code);
    }

    @Test
    void testLegitVoteAndSpoof() throws Exception {
        String code = "AUTH1";
        PassThroughStomp a = newClient("aut1-a", "key-auth-a001");
        createRoom(a, code, "1111");
        PassThroughStomp b = newClient("aut1-b", "key-auth-b001");
        PassThroughStomp c = newClient("aut1-c", "key-auth-c001");
        PassThroughStomp d = newClient("aut1-d", "key-auth-d001");
        PassThroughStomp e = newClient("aut1-e", "key-auth-e001");
        List<PassThroughStomp> all = List.of(a, b, c, d, e);
        for (PassThroughStomp p : all.subList(1, all.size())) joinRoom(p, code, "1111");

        startGame(a, code);
        setRoles(code, Map.of(
                "aut1-a", Role.ENGINEER, "aut1-b", Role.DOCTOR, "aut1-c", Role.GUARDIAN_ANGEL,
                "aut1-d", Role.GNOSIA, "aut1-e", Role.HUMAN));
        advance(code); // INTRO → DISCUSSION
        advance(code); // DISCUSSION → VOTING

        // Legit vote without any actor id in the payload
        vote(a, code, Map.of("targetId", "aut1-b"));
        awaitAssert(() -> assertThat(room(code).getGameState().getCurrentVotes())
                .containsEntry("aut1-a", "aut1-b"));

        // Spoofed vote claiming to be aut1-b — server must ignore voterId
        vote(a, code, Map.of("voterId", "aut1-b", "targetId", "aut1-c"));
        awaitAssert(() -> assertThat(room(code).getGameState().getCurrentVotes())
                .containsEntry("aut1-a", "aut1-c"));
        awaitAssert(() -> assertThat(room(code).getGameState().getCurrentVotes())
                .doesNotContainKey("aut1-b"));
    }

    @Test
    void testScanSpoofRejected() throws Exception {
        String code = "SCAN1";
        PassThroughStomp a = newClient("scan-a", "key-scan-a001");
        createRoom(a, code, "2222");
        PassThroughStomp b = newClient("scan-b", "key-scan-b001");
        PassThroughStomp c = newClient("scan-c", "key-scan-c001");
        PassThroughStomp d = newClient("scan-d", "key-scan-d001");
        PassThroughStomp e = newClient("scan-e", "key-scan-e001");
        List<PassThroughStomp> all = List.of(a, b, c, d, e);
        for (PassThroughStomp p : all.subList(1, all.size())) joinRoom(p, code, "2222");

        Room room = setupWarp(code, all, Map.of(
                "scan-a", Role.ENGINEER, "scan-b", Role.DOCTOR, "scan-c", Role.GUARDIAN_ANGEL,
                "scan-d", Role.GNOSIA, "scan-e", Role.HUMAN), "scan-e");

        // Non-engineer spoofs a scan as the engineer: rejected on the real identity's channel
        b.session.send("/app/room/" + code + "/scan",
                Map.of("scannerId", "scan-a", "targetId", "scan-d"));
        Map<String, Object> rejected = b.await("ACTION_REJECTED");
        assertThat(rejected.get("action")).isEqualTo("SCAN");
        assertThat(room.getGameState().getPlayerActionDone()).doesNotContainKey("scan-a");

        // Legit engineer scan must still work
        a.session.send("/app/room/" + code + "/scan", Map.of("targetId", "scan-d"));
        Map<String, Object> result = a.await("SCAN_RESULT");
        assertThat(result.get("result")).isEqualTo("GNOSIA");
    }

    @Test
    void testDuplicateAndReconnect() throws Exception {
        String code = "DUP1";
        PassThroughStomp a1 = newClient("dup-a", "key-dup-a001");
        createRoom(a1, code, "3333");

        // Second session claims the same identity with the wrong key
        PassThroughStomp wrong = newClient("dup-a", "key-wrong-e01");
        wrong.session.send("/app/room/" + code + "/join",
                Map.of("id", "dup-a", "channelKey", "key-wrong-e01", "pin", "3333"));
        wrong.await("JOIN_ERROR");

        // Second session claims the same identity while it is still active elsewhere
        PassThroughStomp a2 = newClient("dup-a", "key-dup-a001");
        a2.session.send("/app/room/" + code + "/join",
                Map.of("id", "dup-a", "channelKey", "key-dup-a001", "pin", "3333"));
        Map<String, Object> dupErr = a2.await("JOIN_ERROR");
        assertThat(dupErr.get("message").toString().toLowerCase()).contains("active");

        // Original session drops — identity is released
        a1.session.disconnect();
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline
                && identityService.playerIdForSession(a1.session.getSessionId()) != null) {
            Thread.sleep(50);
        }
        assertThat(identityService.playerIdForSession(a1.session.getSessionId())).isNull();
        openSessions.remove(a1.session);

        // Same identity reconnects with the correct key
        PassThroughStomp a3 = newClient("dup-a", "key-dup-a001");
        joinRoom(a3, code, "3333");
    }

    @Test
    void testUnboundRejected() throws Exception {
        String code = "UNB1";
        PassThroughStomp a = newClient("unb-a", "key-unb-a001");
        createRoom(a, code, "4444");

        PassThroughStomp attacker = newClient("unb-att", "key-unb-at01");
        attacker.session.send("/app/room/" + code + "/vote", Map.of("targetId", "unb-a"));

        assertThat(attacker.inbox.poll(2000, TimeUnit.MILLISECONDS)).as(
                "unbound session must be silently dropped, no rejection or state change").isNull();
        assertThat(room(code).getGameState().getCurrentVotes()).isEmpty();
    }

    @Test
    void testCrossRoomVoteIgnored() throws Exception {
        String codeA = "CROS1";
        String codeX = "CROS2";
        PassThroughStomp a = newClient("cros-a", "key-cros-a001");
        createRoom(a, codeA, "5555");
        PassThroughStomp x = newClient("cros-x", "key-cros-x001");
        createRoom(x, codeX, "6666");

        advance(codeX); // LOBBY → INTRO
        advance(codeX); // INTRO → DISCUSSION
        advance(codeX); // DISCUSSION → VOTING

        vote(x, codeX, Map.of("targetId", "cros-x"));
        awaitAssert(() -> assertThat(room(codeX).getGameState().getCurrentVotes())
                .containsEntry("cros-x", "cros-x"));

        // A is bound to CROS1; its vote inside CROS2 must be silently ignored
        vote(a, codeX, Map.of("targetId", "cros-x"));
        awaitAssert(() -> assertThat(room(codeX).getGameState().getCurrentVotes())
                .containsOnlyKeys("cros-x"));
    }

    @Test
    void testDmSpoof() throws Exception {
        String code = "DMS1";
        PassThroughStomp a = newClient("dm-a", "key-dm-a001");
        createRoom(a, code, "7777");
        PassThroughStomp b = newClient("dm-b", "key-dm-b001");
        joinRoom(b, code, "7777");

        // A sends a DM claiming to be the recipient — server must stamp the real sender
        a.session.send("/app/room/" + code + "/dm",
                Map.of("senderId", "dm-b", "targetId", "dm-b", "content", "hello-b"));

        Map<String, Object> delivered = b.await("DM");
        Map<?, ?> message = (Map<?, ?>) delivered.get("message");
        assertThat(message.get("senderId")).isEqualTo("dm-a");
        assertThat(message.get("senderName")).isNotNull();
        assertThat(delivered.get("withId")).isEqualTo("dm-a");
    }

    @Test
    void testPinEnforced() throws Exception {
        String code = "PINE1";
        PassThroughStomp a = newClient("pine-a", "key-pine-a001");
        createRoom(a, code, "4242");

        // Correct PIN joins
        PassThroughStomp ok = newClient("pine-b", "key-pine-b001");
        joinRoom(ok, code, "4242");

        // Wrong PIN rejected
        PassThroughStomp wrong = newClient("pine-c", "key-pine-c001");
        wrong.session.send("/app/room/" + code + "/join",
                Map.of("id", "pine-c", "channelKey", "key-pine-c001", "pin", "9999"));
        Map<String, Object> wrongErr = wrong.await("JOIN_ERROR");
        assertThat(wrongErr.get("message").toString().toLowerCase()).contains("pin");
        assertThat(room(code).getPlayer("pine-c")).isNull();

        // Missing PIN rejected
        PassThroughStomp missing = newClient("pine-d", "key-pine-d001");
        missing.session.send("/app/room/" + code + "/join",
                Map.of("id", "pine-d", "channelKey", "key-pine-d001"));
        missing.await("JOIN_ERROR");
        assertThat(room(code).getPlayer("pine-d")).isNull();

        // Malformed PIN rejected
        PassThroughStomp malformed = newClient("pine-e", "key-pine-e001");
        malformed.session.send("/app/room/" + code + "/join",
                Map.of("id", "pine-e", "channelKey", "key-pine-e001", "pin", "ab12"));
        malformed.await("JOIN_ERROR");
        assertThat(room(code).getPlayer("pine-e")).isNull();
    }

    @Test
    void testCreateRequiresValidPinAndCode() throws Exception {
        PassThroughStomp a = newClient("pin2-a", "key-pin2-a001");
        a.session.send("/app/room/create",
                Map.of("playerId", "pin2-a", "channelKey", "key-pin2-a001",
                        "roomCode", "PIN2A", "participants", 5, "pin", "12ab"));
        Map<String, Object> badPin = a.await("JOIN_ERROR");
        assertThat(badPin.get("message").toString().toLowerCase()).contains("pin");

        PassThroughStomp b = newClient("pin2-b", "key-pin2-b001");
        b.session.send("/app/room/create",
                Map.of("playerId", "pin2-b", "channelKey", "key-pin2-b001",
                        "roomCode", "X!", "participants", 5, "pin", "1111"));
        Map<String, Object> badCode = b.await("JOIN_ERROR");
        assertThat(badCode.get("message").toString().toLowerCase()).contains("room");
        assertThat(roomManager.getRoom("X!")).isNull();
    }

    @Test
    void testInvalidRoomRejected() throws Exception {
        PassThroughStomp a = newClient("inv-a", "key-inv-a001");
        a.session.send("/app/room/" + "NOPE1" + "/join",
                Map.of("id", "inv-a", "channelKey", "key-inv-a001", "pin", "1111"));
        a.await("JOIN_ERROR");

        // Malformed room code rejected before any lookup
        PassThroughStomp b = newClient("inv-b", "key-inv-b001");
        b.session.send("/app/room/" + "???" + "/join",
                Map.of("id", "inv-b", "channelKey", "key-inv-b001", "pin", "1111"));
        b.await("JOIN_ERROR");
    }

    @Test
    void testFullRoomRejected() throws Exception {
        String code = "FULL1";
        PassThroughStomp a = newClient("full-a", "key-full-a001");
        createRoom(a, code, "8888");
        for (String id : List.of("full-b", "full-c", "full-d", "full-e")) {
            PassThroughStomp p = newClient(id, "key-" + id);
            joinRoom(p, code, "8888");
        }
        PassThroughStomp outsider = newClient("full-z", "key-full-z001");
        outsider.session.send("/app/room/" + code + "/join",
                Map.of("id", "full-z", "channelKey", "key-full-z001", "pin", "8888"));
        Map<String, Object> err = outsider.await("JOIN_ERROR");
        assertThat(err.get("message").toString().toLowerCase()).contains("capacity");
        assertThat(room(code).getPlayer("full-z")).isNull();
    }

    @Test
    void testStartedRoomRejectsNewMembersButAllowsReconnect() throws Exception {
        String code = "STAR1";
        PassThroughStomp a = newClient("star-a", "key-star-a001");
        createRoom(a, code, "1212");
        List<PassThroughStomp> members = new ArrayList<>();
        for (String id : List.of("star-b", "star-c", "star-d", "star-e")) {
            PassThroughStomp p = newClient(id, "key-" + id);
            joinRoom(p, code, "1212");
            members.add(p);
        }

        startGame(a, code);
        advance(code); // INTRO → DISCUSSION

        // A new player can no longer join a started game
        PassThroughStomp late = newClient("star-z", "key-star-z001");
        late.session.send("/app/room/" + code + "/join",
                Map.of("id", "star-z", "channelKey", "key-star-z001", "pin", "1212"));
        Map<String, Object> err = late.await("JOIN_ERROR");
        assertThat(err.get("message").toString().toLowerCase()).contains("started");
        assertThat(room(code).getPlayer("star-z")).isNull();

        // An existing member can still reconnect with their PIN
        PassThroughStomp b = members.get(0);
        b.session.disconnect();
        openSessions.remove(b.session);
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline
                && identityService.playerIdForSession(b.session.getSessionId()) != null) {
            Thread.sleep(50);
        }
        PassThroughStomp b2 = newClient("star-b", "key-star-b");
        joinRoom(b2, code, "1212");
    }

    @Test
    void testCrossRoomJoinRejected() throws Exception {
        String codeA = "XA11";
        String codeB = "XB11";
        PassThroughStomp a = newClient("xra-a", "key-xra-a001");
        createRoom(a, codeA, "1414");
        PassThroughStomp x = newClient("xra-x", "key-xra-x001");
        createRoom(x, codeB, "1515");

        // A's identity is bound to XA1; joining XB1 must be rejected
        a.session.send("/app/room/" + codeB + "/join",
                Map.of("id", "xra-a", "channelKey", "key-xra-a001", "pin", "1515"));
        Map<String, Object> err = a.await("JOIN_ERROR");
        assertThat(err.get("message").toString().toLowerCase()).contains("another room");
        assertThat(room(codeB).getPlayer("xra-a")).isNull();
    }

    @Test
    void testDuplicateSessionRejected() throws Exception {
        String code = "DUP2";
        PassThroughStomp a = newClient("ds-a", "key-ds-a001");
        createRoom(a, code, "1616");
        joinRoom(a, code, "1616");

        // Same session tries to claim a second identity in the same room
        a.session.send("/app/room/" + code + "/join",
                Map.of("id", "ds-b", "channelKey", "key-ds-a001", "pin", "1616"));
        Map<String, Object> err = a.await("JOIN_ERROR");
        assertThat(err.get("message").toString().toLowerCase()).contains("bound");
        assertThat(room(code).getPlayer("ds-b")).isNull();
    }

    @Test
    void testReconnectIdentityTheftRejected() throws Exception {
        String code = "IDEN1";
        PassThroughStomp victim = newClient("iden-1", "key-iden-v001");
        createRoom(victim, code, "1717");

        // Victim disconnects, releasing the identity
        victim.session.disconnect();
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline
                && identityService.playerIdForSession(victim.session.getSessionId()) != null) {
            Thread.sleep(50);
        }
        openSessions.remove(victim.session);

        // Attacker tries to reconnect as the victim with a stolen playerId but wrong key
        PassThroughStomp attacker = newClient("iden-1", "key-iden-atk1");
        attacker.session.send("/app/room/" + code + "/join",
                Map.of("id", "iden-1", "channelKey", "key-iden-atk1", "pin", "1717"));
        attacker.await("JOIN_ERROR");
        assertThat(room(code).getPlayer("iden-1").isConnected()).isFalse();

        // Legitimate victim reconnects with their own key
        PassThroughStomp legit = newClient("iden-1", "key-iden-v001");
        joinRoom(legit, code, "1717");
        assertThat(room(code).getPlayer("iden-1").isConnected()).isTrue();
    }

    @Test
    void testPinNotExposedOnPublicState() throws Exception {
        String code = "PNL1";
        PassThroughStomp a = newClient("pnl-a", "key-pnl-a001");
        a.subscribeRoom(code);
        createRoom(a, code, "9999");

        // The room state broadcast must never contain a pin
        Map<String, Object> state = a.pollForRoomState();
        assertThat(state).isNotNull();
        assertThat(state).doesNotContainKey("pin");
        assertThat(state.get("roomCode")).isEqualTo(code);
    }

    private static class PassThroughStomp {
        final StompSession session;
        final String playerId;
        final String key;
        final BlockingQueue<Map<String, Object>> inbox = new LinkedBlockingQueue<>();

        PassThroughStomp(StompSession session, String playerId, String key) {
            this.session = session;
            this.playerId = playerId;
            this.key = key;
            session.subscribe("/topic/private/" + key, new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return Map.class;
                }

                @Override
                @SuppressWarnings("unchecked")
                public void handleFrame(StompHeaders headers, Object payload) {
                    if (payload instanceof Map) {
                        inbox.offer((Map<String, Object>) payload);
                    } else {
                        System.out.println("[WARN] non-Map frame for " + playerId + " payload class="
                                + (payload == null ? "null" : payload.getClass().getName()));
                    }
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

        void subscribeRoom(String code) {
            session.subscribe("/topic/room/" + code, new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return Map.class;
                }

                @Override
                @SuppressWarnings("unchecked")
                public void handleFrame(StompHeaders headers, Object payload) {
                    if (payload instanceof Map) {
                        inbox.offer((Map<String, Object>) payload);
                    }
                }
            });
        }

        Map<String, Object> pollForRoomState() throws Exception {
            long deadline = System.currentTimeMillis() + 8000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(500, TimeUnit.MILLISECONDS);
                if (msg != null && msg.containsKey("roomCode")
                        && !"ROOM_CREATED".equals(msg.get("type"))) {
                    return msg;
                }
            }
            throw new AssertionError("Timed out waiting for room state broadcast on player " + playerId);
        }
    }
}