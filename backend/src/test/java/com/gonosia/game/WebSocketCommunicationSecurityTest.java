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
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Room list-driven WebRTC signaling security. Runs in its OWN Spring context
 * (property overrides) so the heavily throttle-sensitive signaling suite is
 * isolated from the shared default context's accumulated rooms/timers, and with
 * a generous room-creation budget for the loopback IP the whole suite shares.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "app.rate-limit.room-creation.limit=1000",
            "app.rate-limit.room-creation.window-ms=60000"
        })
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
        // Retry a bounded number of times: the embedded broker under a heavy
        // suite can transiently throttle a room-creation burst (shared loopback
        // IP), so a single hiccup should not sink the whole class.
        long deadline = System.currentTimeMillis() + 15000;
        while (System.currentTimeMillis() < deadline) {
            creator.session.send("/app/room/create",
                    Map.of("playerId", creator.playerId, "channelKey", creator.key,
                            "roomCode", code, "participants", 5, "pin", pin));
            if (creator.awaitOpt("ROOM_CREATED", 1500) != null) return;
            Thread.sleep(500);
        }
        throw new AssertionError("Timed out creating room " + code + " for " + creator.playerId);
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

    @Test
    void testSignalFromDeadPlayerSilent() throws Exception {
        String code = "SIG5";
        PassThroughStomp[] all = setupStartedRoom("dsg", code, "2323");
        PassThroughStomp a = all[0], b = all[1];
        room(code).getPlayer("dsg-a").setAlive(false);
        a.session.send("/app/room/" + code + "/signal",
                Map.of("targetId", "dsg-b", "type", "OFFER", "sdp", "ghost"));
        assertThat(b.awaitNoSignal(1500)).isTrue();
    }

    @Test
    void testSignalFromCryosleptPlayerSilent() throws Exception {
        String code = "SIG6";
        PassThroughStomp[] all = setupStartedRoom("crs", code, "2424");
        PassThroughStomp a = all[0], b = all[1];
        room(code).getPlayer("crs-a").setCryoslept(true);
        room(code).getPlayer("crs-a").setAlive(false);
        a.session.send("/app/room/" + code + "/signal",
                Map.of("targetId", "crs-b", "type", "OFFER", "sdp", "ghost"));
        assertThat(b.awaitNoSignal(1500)).isTrue();
    }

    @Test
    void testSignalToDeadTargetSilent() throws Exception {
        String code = "SIG7";
        PassThroughStomp[] all = setupStartedRoom("dtt", code, "2525");
        PassThroughStomp a = all[0], b = all[1];
        room(code).getPlayer("dtt-b").setAlive(false);
        a.session.send("/app/room/" + code + "/signal",
                Map.of("targetId", "dtt-b", "type", "OFFER", "sdp", "ghost"));
        // The signal is not routed; nothing reaches the private topic of b.
        assertThat(b.awaitNoSignal(1500)).isTrue();
    }

    @Test
    void testDuplicateSignalsAllDelivered() throws Exception {
        String code = "SIG8";
        PassThroughStomp[] all = setupStartedRoom("dup", code, "2626");
        PassThroughStomp a = all[0], b = all[1];
        for (int i = 0; i < 3; i++) {
            a.session.send("/app/room/" + code + "/signal",
                    Map.of("targetId", "dup-b", "type", "OFFER", "seq", i));
        }
        // Routing is idempotent for the same sender/target pair: every duplicate
        // frame reaches the target (no dedup drop, no collision).
        Set<Integer> seen = new HashSet<>();
        long deadline = System.currentTimeMillis() + 8000;
        while (seen.size() < 3 && System.currentTimeMillis() < deadline) {
            Map<String, Object> msg = b.awaitSignalFrom("dup-a");
            seen.add(((Number) msg.get("seq")).intValue());
        }
        assertThat(seen).containsExactlyInAnyOrder(0, 1, 2);
    }

    @Test
    void testSignalFloodThrottled() throws Exception {
        String code = "SIG9";
        PassThroughStomp[] all = setupStartedRoom("fld", code, "2727");
        PassThroughStomp a = all[0], b = all[1];
        int sent = 45;
        for (int i = 0; i < sent; i++) {
            a.session.send("/app/room/" + code + "/signal",
                    Map.of("targetId", "fld-b", "type", "OFFER", "seq", i));
        }
        // The per-session/player/IP signaling window is 30 per second, so a hard
        // burst cannot be replayed onto the target without being throttled.
        int delivered = b.countSignals(2500);
        assertThat(delivered).isGreaterThan(0);
        assertThat(delivered).isLessThan(sent);
    }

    @Test
    void testSignalAfterLeaveAndReconnect() throws Exception {
        String code = "SIG10";
        PassThroughStomp[] all = setupStartedRoom("rc", code, "2828");
        PassThroughStomp a = all[0], b = all[1];

        // a leaves: the session disconnects and its identity is released.
        a.session.disconnect();
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline
                && identityService.playerIdForSession(a.session.getSessionId()) != null) {
            Thread.sleep(50);
        }
        assertThat(identityService.playerIdForSession(a.session.getSessionId())).isNull();

        // While a is gone, a signal aimed at a (now-disconnected target) is
        // silently dropped and is NOT queued for delivery on rejoin.
        b.session.send("/app/room/" + code + "/signal",
                Map.of("targetId", "rc-a", "type", "OFFER", "sdp", "stale"));

        // a reconnects with the same playerId + channelKey.
        PassThroughStomp a2 = newClient("rc-a", "key-rc-a001");
        joinRoom(a2, code, "2828");
        assertThat(a2.awaitNoSignal(1200)).isTrue();

        // Fresh signaling works again after the rejoin.
        a2.session.send("/app/room/" + code + "/signal",
                Map.of("targetId", "rc-b", "type", "OFFER", "sdp", "recon"));
        Map<String, Object> sig = b.awaitSignalFrom("rc-a");
        assertThat(sig.get("sdp")).isEqualTo("recon");
    }

    @Test
    void testSimultaneousJoinsRouteEveryPair() throws Exception {
        String code = "SIG11";
        PassThroughStomp[] all = setupStartedRoom("sj", code, "2929");
        // All five members joined in a burst before start; verify that after the
        // burst every sender/target pair can negotiate directly. Sends are paced
        // slightly so the shared embedded broker relays them in order without
        // needing its thread pools to burst-absorb 20 frames at once.
        for (int i = 0; i < all.length; i++) {
            for (int j = 0; j < all.length; j++) {
                if (i == j) continue;
                String from = "sj-" + (char) ('a' + i);
                String to = "sj-" + (char) ('a' + j);
                all[i].session.send("/app/room/" + code + "/signal",
                        Map.of("targetId", to, "type", "OFFER", "seq", i + "-" + j));
                Thread.sleep(20);
            }
        }
        Set<String> everyone = new HashSet<>();
        for (PassThroughStomp p : all) everyone.add(p.playerId);
        for (PassThroughStomp recipient : all) {
            Set<String> others = new HashSet<>(everyone);
            others.remove(recipient.playerId);
            recipient.awaitSignalsFromAll(others, 20000);
        }
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

        /** @return the next SIGNAL frame sent by the given player. */
        Map<String, Object> awaitSignalFrom(String fromId) throws Exception {
            long deadline = System.currentTimeMillis() + 12000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(500, TimeUnit.MILLISECONDS);
                if (msg != null && "SIGNAL".equals(msg.get("type"))
                        && fromId.equals(msg.get("fromId"))) {
                    return msg;
                }
            }
            throw new AssertionError("Timed out waiting for SIGNAL from " + fromId + " on player " + playerId);
        }

        /** @return how many SIGNAL frames arrived within the window (drains them). */
        int countSignals(long ms) throws Exception {
            int count = 0;
            long deadline = System.currentTimeMillis() + ms;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(200, TimeUnit.MILLISECONDS);
                if (msg == null) continue;
                if ("SIGNAL".equals(msg.get("type"))) count++;
            }
            return count;
        }

        /** Drains until a SIGNAL has been seen from every listed sender or the deadline passes. */
        void awaitSignalsFromAll(Set<String> fromIds, long ms) throws Exception {
            Set<String> seen = new HashSet<>();
            long deadline = System.currentTimeMillis() + ms;
            while (seen.size() < fromIds.size() && System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(250, TimeUnit.MILLISECONDS);
                if (msg != null && "SIGNAL".equals(msg.get("type"))
                        && fromIds.contains(msg.get("fromId"))) {
                    seen.add((String) msg.get("fromId"));
                }
            }
            assertThat(seen).as("SIGNALs received on player " + playerId).containsAll(fromIds);
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
            long deadline = System.currentTimeMillis() + 12000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(500, TimeUnit.MILLISECONDS);
                if (msg != null && type.equals(msg.get("type"))) return msg;
            }
            throw new AssertionError("Timed out waiting for " + type + " on player " + playerId);
        }

        /** @return the frame of {@code type} or null if none arrives within the window. */
        Map<String, Object> awaitOpt(String type, long ms) throws Exception {
            long deadline = System.currentTimeMillis() + ms;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> msg = inbox.poll(200, TimeUnit.MILLISECONDS);
                if (msg != null && type.equals(msg.get("type"))) return msg;
            }
            return null;
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
