package com.gonosia.game;

import com.gonosia.game.model.Phase;
import com.gonosia.game.model.Room;
import com.gonosia.game.model.Role;
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

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class WebSocketCommunicationSecurityTest {

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
        // All integration-test clients share the same loopback IP, so the shared
        // in-memory counters would otherwise bleed across test methods.
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
        if (r.getGameState().getPhase() != Phase.LOBBY && r.getGameState().getPhase() != Phase.GAME_OVER) {
            r.getGameState().setRemainingTimeSeconds(3600);
        }
    }

    private void advance(String code) {
        Room r = room(code);
        gameService.transitionPhase(r);
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

    private void startGame(PassThroughStomp creator, String code) throws Exception {
        creator.session.send("/app/room/" + code + "/start", Map.of());
        Room r = awaitPhase(code, Phase.INTRO);
        r.getGameState().setRemainingTimeSeconds(3600);
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

    private void setRole(String code, String playerId, Role role) {
        room(code).getPlayer(playerId).setRole(role);
    }

    /** Build a 5-member room, start it, return the members keyed by role index. */
    private PassThroughStomp[] setupStartedRoom(String prefix, String code, String pin) throws Exception {
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

    private PassThroughStomp[] setupWarpRoom(String prefix, String code, String pin) throws Exception {
        PassThroughStomp[] all = setupStartedRoom(prefix, code, pin);
        setRole(code, prefix + "-a", Role.ENGINEER);
        setRole(code, prefix + "-b", Role.DOCTOR);
        setRole(code, prefix + "-c", Role.HUMAN);
        setRole(code, prefix + "-d", Role.GNOSIA);
        setRole(code, prefix + "-e", Role.HUMAN);
        advance(code); // INTRO → DISCUSSION
        advance(code); // DISCUSSION → VOTING
        return all;
    }

    // ══════════════════════════════════════════════════════════════════════
    //                          C H A T
    // ══════════════════════════════════════════════════════════════════════

    @Test
    void testValidChatBroadcast() throws Exception {
        String code = "CHT1";
        PassThroughStomp[] all = setupStartedRoom("vc", code, "1111");
        PassThroughStomp a = all[0], b = all[1];
        b.subscribeRoomChat(code);
        a.session.send("/app/room/" + code + "/chat",
                Map.of("senderId", "vc-b", "senderName", "Spoofed", "content", "hello crew", "isGonosiaOnly", true));
        Map<String, Object> chat = b.awaitChat();
        assertThat(chat.get("content")).isEqualTo("hello crew");
        // Server stamps the real sender and ignores client sender fields.
        assertThat(chat.get("senderId")).isEqualTo("vc-a");
        assertThat(chat.get("senderName")).isNotEqualTo("Spoofed");
        assertThat(chat.get("gonosiaOnly")).isEqualTo(Boolean.FALSE);
    }

    @Test
    void testUnauthorizedChatSilent() throws Exception {
        String code = "CHT2";
        PassThroughStomp a = newClient("uc-a", "key-uc-a001");
        createRoom(a, code, "2222");
        // An unbound session sends chat — must be silently dropped.
        PassThroughStomp intruder = newClient("uc-int", "key-uc-int01");
        intruder.subscribeRoomChat(code);
        intruder.session.send("/app/room/" + code + "/chat", Map.of("content", "intrusion"));
        assertThat(intruder.chatArrived()).isFalse();
    }

    @Test
    void testChatSpoofedSenderIgnored() throws Exception {
        String code = "CHT3";
        PassThroughStomp[] all = setupStartedRoom("cs", code, "3333");
        PassThroughStomp a = all[0], b = all[1];
        b.subscribeRoomChat(code);
        a.session.send("/app/room/" + code + "/chat",
                Map.of("senderId", "cs-b", "senderName", "Fake", "content", "spoof"));
        Map<String, Object> chat = b.awaitChat();
        assertThat(chat.get("senderId")).isEqualTo("cs-a");
        assertThat(chat.get("senderName")).isNotEqualTo("Fake");
    }

    @Test
    void testOversizedChatSilent() throws Exception {
        String code = "CHT4";
        PassThroughStomp[] all = setupStartedRoom("oc", code, "4444");
        PassThroughStomp a = all[0], b = all[1];
        b.subscribeRoomChat(code);
        String huge = "x".repeat(6000);
        a.session.send("/app/room/" + code + "/chat", Map.of("content", huge));
        assertThat(b.chatArrived()).isFalse();
    }

    @Test
    void testDeadPlayerChatSilent() throws Exception {
        String code = "CHT5";
        PassThroughStomp[] all = setupStartedRoom("dp", code, "5555");
        PassThroughStomp a = all[0], b = all[1];
        b.subscribeRoomChat(code);
        room(code).getPlayer("dp-a").setAlive(false);
        a.session.send("/app/room/" + code + "/chat", Map.of("content", "ghost"));
        assertThat(b.chatArrived()).isFalse();
    }

    // ══════════════════════════════════════════════════════════════════════
    //                          D M
    // ══════════════════════════════════════════════════════════════════════

    @Test
    void testValidDm() throws Exception {
        String code = "DM01";
        PassThroughStomp[] all = setupStartedRoom("vd", code, "6666");
        PassThroughStomp a = all[0], b = all[1];
        a.session.send("/app/room/" + code + "/dm",
                Map.of("senderId", "vd-b", "targetId", "vd-b", "content", "secret"));
        Map<String, Object> delivered = b.await("DM");
        Map<?, ?> message = (Map<?, ?>) delivered.get("message");
        assertThat(message.get("senderId")).isEqualTo("vd-a");
        assertThat(message.get("content")).isEqualTo("secret");
        assertThat(delivered.get("withId")).isEqualTo("vd-a");
    }

    @Test
    void testDmSpoofedTargetIgnored() throws Exception {
        String code = "DM02";
        // A targets a player who exists but in a DIFFERENT room — must not deliver.
        PassThroughStomp[] all = setupStartedRoom("st", code, "7777");
        PassThroughStomp a = all[0];
        PassThroughStomp x = newClient("st-x", "key-st-x001");
        createRoom(x, "DMX1", "8888");
        a.session.send("/app/room/" + code + "/dm",
                Map.of("targetId", "st-x", "content", "oops"));
        assertThat(x.awaitNoDm(1500)).isTrue();
    }

    @Test
    void testDmInvalidTargetSilent() throws Exception {
        String code = "DM03";
        PassThroughStomp[] all = setupStartedRoom("it", code, "9999");
        PassThroughStomp a = all[0], b = all[1];
        a.session.send("/app/room/" + code + "/dm", Map.of("targetId", "ghost", "content", "nope"));
        assertThat(b.awaitNoDm(1500)).isTrue();
    }

    @Test
    void testDmCrossRoomRejected() throws Exception {
        String codeA = "DMC1";
        String codeB = "DMC2";
        PassThroughStomp a = newClient("cr-a", "key-cr-a001");
        createRoom(a, codeA, "1212");
        PassThroughStomp b = newClient("cr-b", "key-cr-b001");
        createRoom(b, codeB, "1313");
        // a (in DMC1) DMs b (in DMC2) — resolve happens in a's room, so b is not
        // a member there and no DM is delivered.
        a.session.send("/app/room/" + codeA + "/dm",
                Map.of("targetId", "cr-b", "content", "cross-room"));
        assertThat(b.awaitNoDm(1500)).isTrue();
    }

    @Test
    void testDmSelfRejected() throws Exception {
        String code = "DM04";
        PassThroughStomp[] all = setupStartedRoom("slf", code, "1414");
        PassThroughStomp a = all[0];
        a.session.send("/app/room/" + code + "/dm",
                Map.of("targetId", "slf-a", "content", "to-self"));
        assertThat(a.awaitNoDm(1500)).isTrue();
    }

    // ══════════════════════════════════════════════════════════════════════
    //                    G N O S I A   C H A T
    // ══════════════════════════════════════════════════════════════════════

    @Test
    void testGnosiaChatAuthorizedSender() throws Exception {
        String code = "GNO1";
        PassThroughStomp[] all = setupWarpRoom("gd", code, "1515");
        PassThroughStomp d = all[3]; // GNOSIA
        PassThroughStomp e = all[4]; // HUMAN spoofs a GNOSIA role in the payload
        e.session.send("/app/room/" + code + "/gnosia-chat",
                Map.of("senderId", "gd-d", "role", "GNOSIA", "isGnosia", true, "content", "i am gnosia"));
        // Spoofing human must not reach the real gnosia.
        assertThat(d.awaitNoGnosiaChat(1500)).isTrue();
    }

    @Test
    void testGnosiaChatLegitGnosia() throws Exception {
        String code = "GNO2";
        PassThroughStomp[] all = setupWarpRoom("gl", code, "1616");
        PassThroughStomp d = all[3]; // GNOSIA
        d.session.send("/app/room/" + code + "/gnosia-chat",
                Map.of("senderId", "gl-b", "role", "HUMAN", "isGnosia", false, "content", "real gnosia msg"));
        // Server derives the role from the session (gl-d is GNOSIA); a human-named
        // payload cannot block it. It must reach the gnosia.
        Map<String, Object> received = d.await("GNOSIA_CHAT");
        Map<?, ?> message = (Map<?, ?>) received.get("message");
        assertThat(message.get("senderId")).isEqualTo("gl-d");
        assertThat(message.get("content")).isEqualTo("real gnosia msg");
    }

    @Test
    void testGnosiaChatHumanRejected() throws Exception {
        String code = "GNO3";
        PassThroughStomp[] all = setupWarpRoom("gh", code, "1717");
        PassThroughStomp c = all[2]; // HUMAN
        PassThroughStomp d = all[3]; // GNOSIA
        c.session.send("/app/room/" + code + "/gnosia-chat",
                Map.of("content", "pretending to be gnosia"));
        assertThat(d.awaitNoGnosiaChat(1500)).isTrue();
    }

    // ══════════════════════════════════════════════════════════════════════
    //                      W E B R T C   S I G N A L I N G
    // ══════════════════════════════════════════════════════════════════════

    @Test
    void testValidSignalDelivery() throws Exception {
        String code = "SIG1";
        PassThroughStomp[] all = setupStartedRoom("sg", code, "1818");
        PassThroughStomp a = all[0], b = all[1];
        a.session.send("/app/room/" + code + "/signal",
                Map.of("targetId", "sg-b", "type", "OFFER", "sdp", "abc"));
        Map<String, Object> signal = b.await("SIGNAL");
        assertThat(signal.get("fromId")).isEqualTo("sg-a");
        assertThat(signal.get("sdp")).isEqualTo("abc");
    }

    @Test
    void testCrossRoomSignalRejected() throws Exception {
        String codeA = "SIG2";
        String codeB = "SIG3";
        PassThroughStomp a = newClient("sr-a", "key-sr-a001");
        createRoom(a, codeA, "1919");
        PassThroughStomp b = newClient("sr-b", "key-sr-b001");
        createRoom(b, codeB, "2020");
        // a (in SIG2) signals b (in SIG3) — b is not a member of SIG2, so no signal.
        a.session.send("/app/room/" + codeA + "/signal",
                Map.of("targetId", "sr-b", "type", "OFFER"));
        assertThat(b.awaitNoSignal(1500)).isTrue();
    }

    @Test
    void testSignalToInvalidTargetSilent() throws Exception {
        String code = "SIG4";
        PassThroughStomp[] all = setupStartedRoom("si", code, "2121");
        PassThroughStomp a = all[0], b = all[1];
        a.session.send("/app/room/" + code + "/signal",
                Map.of("targetId", "ghost", "type", "OFFER"));
        assertThat(b.awaitNoSignal(1500)).isTrue();
    }

    // ══════════════════════════════════════════════════════════════════════
    //                    I N V A L I D   S E S S I O N
    // ══════════════════════════════════════════════════════════════════════

    @Test
    void testInvalidSessionAllActionsSilent() throws Exception {
        String code = "SES1";
        PassThroughStomp a = newClient("is-a", "key-is-a001");
        createRoom(a, code, "2222");
        PassThroughStomp intruder = newClient("is-int", "key-is-int01");
        intruder.subscribeRoomChat(code);
        // An unbound session attempts every communication action — all silently
        // dropped with no broadcast to any member.
        intruder.session.send("/app/room/" + code + "/chat", Map.of("content", "x"));
        intruder.session.send("/app/room/" + code + "/dm", Map.of("targetId", "is-a", "content", "x"));
        intruder.session.send("/app/room/" + code + "/gnosia-chat", Map.of("content", "x"));
        intruder.session.send("/app/room/" + code + "/signal", Map.of("targetId", "is-a"));
        assertThat(intruder.chatArrived()).isFalse();
        assertThat(a.awaitNoDm(1200)).isTrue();
    }

    // ─── helpers / plumbing ───────────────────────────────────────────────

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

        /** @return true when an actual chat broadcast is observed within the window. */
        boolean chatArrived() throws Exception {
            long deadline = System.currentTimeMillis() + 2500;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(250, TimeUnit.MILLISECONDS);
                if (msg != null && msg.containsKey("content") && msg.containsKey("senderId")) return true;
            }
            return false;
        }

        /** @return true when NO DM was delivered within the window (other frames discarded). */
        boolean awaitNoDm(long ms) throws Exception {
            long deadline = System.currentTimeMillis() + ms;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(200, TimeUnit.MILLISECONDS);
                if (msg != null && "DM".equals(msg.get("type"))) return false;
            }
            return true;
        }

        /** @return true when NO gnosia chat was delivered within the window. */
        boolean awaitNoGnosiaChat(long ms) throws Exception {
            long deadline = System.currentTimeMillis() + ms;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(200, TimeUnit.MILLISECONDS);
                if (msg != null && "GNOSIA_CHAT".equals(msg.get("type"))) return false;
            }
            return true;
        }

        /** @return true when NO signal was delivered within the window. */
        boolean awaitNoSignal(long ms) throws Exception {
            long deadline = System.currentTimeMillis() + ms;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(200, TimeUnit.MILLISECONDS);
                if (msg != null && "SIGNAL".equals(msg.get("type"))) return false;
            }
            return true;
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

        Map<String, Object> awaitChat() throws Exception {
            long deadline = System.currentTimeMillis() + 8000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(500, TimeUnit.MILLISECONDS);
                if (msg != null && msg.containsKey("content") && msg.containsKey("senderId")) return msg;
            }
            throw new AssertionError("Timed out waiting for chat broadcast on player " + playerId);
        }
    }
}
