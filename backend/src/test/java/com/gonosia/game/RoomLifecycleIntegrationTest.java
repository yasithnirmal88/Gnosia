package com.gonosia.game;

import com.gonosia.game.model.LifecycleStatus;
import com.gonosia.game.model.Player;
import com.gonosia.game.model.Role;
import com.gonosia.game.model.Room;
import com.gonosia.game.security.SessionIdentityService;
import com.gonosia.game.service.GameService;
import com.gonosia.game.service.RoomCleanupService;
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
 * Room-lifecycle & memory-management tests.
 *
 * <p>Lifecycle: CREATED → LOBBY → ACTIVE → GAME_OVER → (retention) → CLEANUP → REMOVED.
 *
 * <p>Retention is shortened via its own Spring context so the sweep can be
 * exercised in seconds:
 * <ul>
 *   <li>{@code completed-retention-seconds=1} — finished rooms survive 1s, then the
 *       scheduled sweep removes them (verified end-to-end in {@link #gameCompletionRoomIsRetired}).</li>
 *   <li>{@code abandoned-retention-seconds=2} — rooms where every player left get a
 *       2s reconnect grace before the sweep retires them.</li>
 *   <li>{@code empty-retention-seconds=1} — never-filled lobbies are dropped.</li>
 *   <li>{@code max-voting-history=2} — per-room voting buffer must never exceed 2.</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "app.room-lifecycle.completed-retention-seconds=1",
        "app.room-lifecycle.abandoned-retention-seconds=2",
        "app.room-lifecycle.empty-retention-seconds=1",
        "app.room-lifecycle.sweep-interval-ms=1000",
        "app.room-lifecycle.max-voting-history=2",
        "app.rate-limit.enabled=false"
})
class RoomLifecycleIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired private RoomManager roomManager;
    @Autowired private GameService gameService;
    @Autowired private SessionIdentityService identityService;
    @Autowired private RoomCleanupService roomCleanupService;

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

    private void advance(String code) {
        Room r = room(code);
        if (r.getGameState().getPhase() != com.gonosia.game.model.Phase.LOBBY
                && r.getGameState().getPhase() != com.gonosia.game.model.Phase.GAME_OVER) {
            r.getGameState().setRemainingTimeSeconds(3600);
        }
        gameService.transitionPhase(r);
    }

    private void awaitPhase(String code, com.gonosia.game.model.Phase phase) throws Exception {
        long deadline = System.currentTimeMillis() + 8000;
        while (System.currentTimeMillis() < deadline) {
            Room r = roomManager.getRoom(code);
            if (r != null && r.getGameState().getPhase() == phase) return;
            Thread.sleep(100);
        }
        throw new AssertionError("Room " + code + " never reached " + phase);
    }

    /** Five-member started room (INTRO), returned in order. */
    private PassThroughStomp[] startedRoom(String prefix, String code, String pin) throws Exception {
        PassThroughStomp a = newClient(prefix + "-a", "key-" + prefix + "-a001");
        createRoom(a, code, pin);
        PassThroughStomp b = newClient(prefix + "-b", "key-" + prefix + "-b001");
        PassThroughStomp c = newClient(prefix + "-c", "key-" + prefix + "-c001");
        PassThroughStomp d = newClient(prefix + "-d", "key-" + prefix + "-d001");
        PassThroughStomp e = newClient(prefix + "-e", "key-" + prefix + "-e001");
        for (PassThroughStomp p : new PassThroughStomp[]{b, c, d, e}) joinRoom(p, code, pin);

        a.session.send("/app/room/" + code + "/start", Map.of());
        awaitPhase(code, com.gonosia.game.model.Phase.INTRO);
        assertThat(room(code).getLifecycle()).isEqualTo(LifecycleStatus.ACTIVE);
        return new PassThroughStomp[]{a, b, c, d, e};
    }

    private void disconnectClients(PassThroughStomp... clients) throws InterruptedException {
        for (PassThroughStomp c : clients) {
            try {
                if (c.session.isConnected()) c.session.disconnect();
            } catch (Exception ignored) {
            }
        }
        long deadline = System.currentTimeMillis() + 6000;
        while (System.currentTimeMillis() < deadline) {
            boolean allGone = true;
            for (PassThroughStomp c : clients) {
                if (identityService.playerIdForSession(c.session.getSessionId()) != null) {
                    allGone = false;
                    break;
                }
            }
            if (allGone) return;
            Thread.sleep(50);
        }
        throw new AssertionError("sessions never released after disconnect");
    }

    private void awaitAllDisconnected(Room room) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 6000;
        while (System.currentTimeMillis() < deadline) {
            if (room.connectedPlayerCount() == 0) return;
            Thread.sleep(50);
        }
        throw new AssertionError("room players never all disconnected");
    }

    private void awaitAbsent(Room room, int timeoutSeconds) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutSeconds * 1000L;
        while (System.currentTimeMillis() < deadline) {
            if (roomManager.getRoom(room.getRoomCode()) == null) return;
            Thread.sleep(100);
        }
        throw new AssertionError("room " + room.getRoomCode() + " was never removed");
    }

    // ─── Game completion: retained for results/reconnect, then removed ────────

    @Test
    void gameCompletionRoomIsRetired() throws Exception {
        String code = "LIFE1";
        PassThroughStomp[] all = startedRoom("lc", code, "9101");

        // Force a clean HUMAN win: kill the only Gnosia, then walk the machine.
        Room r = room(code);
        Player gnosia = r.getPlayers().stream().filter(p -> p.getRole() == Role.GNOSIA).findFirst().orElseThrow();
        gnosia.setAlive(false);

        advance(code); // INTRO → DISCUSSION
        advance(code); // DISCUSSION → VOTING
        advance(code); // VOTING → RESULT (nobody voted, nobody cryoslept)
        advance(code); // RESULT → CRYOSLEEP
        advance(code); // CRYOSLEEP → GAME_OVER (humans win)

        assertThat(r.getGameState().getPhase()).isEqualTo(com.gonosia.game.model.Phase.GAME_OVER);
        assertThat(r.getLifecycle()).isEqualTo(LifecycleStatus.GAME_OVER);
        assertThat(roomManager.getRoom(code)).as("completed room retained for reconnect").isNotNull();

        // The (1s) scheduled sweep must retire it on its own shortly after.
        awaitAbsent(r, 12);
        assertThat(r.getLifecycle()).isEqualTo(LifecycleStatus.REMOVED);
    }

    // ─── Reconnect: a reconnect inside the grace window keeps the room ───────

    @Test
    void reconnectBeforeCleanupKeepsRoomAlive() throws Exception {
        String code = "LIFE2";
        PassThroughStomp[] all = startedRoom("rl", code, "9102");
        Room r = room(code);
        advance(code); // INTRO → DISCUSSION

        // Everyone leaves → abandoned window starts; room still there.
        disconnectClients(all);
        awaitAllDisconnected(r);
        assertThat(roomManager.getRoom(code)).as("room survives the grace window").isNotNull();
        assertThat(r.getLifecycle()).isEqualTo(LifecycleStatus.ACTIVE);
        assertThat(r.getLastDisconnectMillis()).isGreaterThan(0);

        // Legitimate reconnect (same identity, fresh socket) inside the window.
        PassThroughStomp bAgain = newClient("rl-b", "key-rl-b001");
        joinRoom(bAgain, code, "9102");
        // joinRoom waits for JOIN_CONFIRMED from the new session; immediately after,
        // the room must be untouched and the player marked connected.
        assertThat(roomManager.getRoom(code)).as("reconnect keeps the room").isNotNull();
        assertThat(r.getLastDisconnectMillis()).isZero();
        assertThat(r.connectedPlayerCount()).isEqualTo(1);

        // A sweep run right now must NOT retire a room with a live player.
        roomCleanupService.sweep();
        assertThat(roomManager.getRoom(code)).as("connected room survives sweep").isNotNull();

        // Everyone leaves again and stays gone past the window → now it may go.
        disconnectClients(bAgain);
        awaitAllDisconnected(r);
        r.setLastDisconnectMillis(System.currentTimeMillis() - 5000); // age past retention
        roomCleanupService.sweep();
        assertThat(roomManager.getRoom(code)).isNull();
        assertThat(r.getLifecycle()).isEqualTo(LifecycleStatus.REMOVED);

        // The stale identity is gone too: the old player can no longer rejoin.
        PassThroughStomp bGone = newClient("rl-b", "key-rl-b001");
        bGone.session.send("/app/room/" + code + "/join",
                Map.of("id", "rl-b", "channelKey", "key-rl-b001", "pin", "9102"));
        Map<String, Object> err = bGone.await("JOIN_ERROR");
        assertThat(err.get("message")).isNotNull();
        assertThat(identityService.playerIdForSession(bGone.session.getSessionId())).isNull();
    }

    // ─── Empty rooms: never filled → dropped ─────────────────────────────────

    @Test
    void emptyRoomNeverFilledIsRemoved() {
        Room r = roomManager.createRoom("LIFE3", 5, "9999");
        r.setCreatedAtMillis(System.currentTimeMillis() - 5000);

        roomCleanupService.sweep();

        assertThat(roomManager.getRoom("LIFE3")).isNull();
        assertThat(r.getLifecycle()).isEqualTo(LifecycleStatus.REMOVED);
    }

    // ─── Multiple concurrent rooms: only due ones are retired ────────────────

    @Test
    void multipleConcurrentRoomsOnlyDueRoomsRetired() {
        // Keep-alive lobby: has a connected host, fresh, never a candidate.
        Room keep = roomManager.createRoom("LIFE4", 5, "9999");
        keep.addPlayer(Player.builder().id("alive-host").name("Host")
                .isConnected(true).isAlive(true).build());
        keep.setCreatedAtMillis(System.currentTimeMillis());

        // Empty lobby that never filled, created long ago → due.
        Room empty = roomManager.createRoom("LIFE5", 5, "9999");
        empty.setCreatedAtMillis(System.currentTimeMillis() - 10_000);

        // Lobby where everyone disconnected long ago → due.
        Room abandoned = roomManager.createRoom("LIFE6", 5, "9999");
        abandoned.addPlayer(Player.builder().id("lonely-guest").name("Guest")
                .isConnected(false).isAlive(true).build());
        abandoned.setCreatedAtMillis(System.currentTimeMillis());
        abandoned.setLastDisconnectMillis(System.currentTimeMillis() - 10_000);

        roomCleanupService.sweep();

        assertThat(roomManager.getRoom("LIFE4")).as("live lobby kept").isNotNull();
        assertThat(roomManager.getRoom("LIFE5")).as("empty lobby removed").isNull();
        assertThat(roomManager.getRoom("LIFE6")).as("abandoned lobby removed").isNull();
        assertThat(keep.getLifecycle()).isEqualTo(LifecycleStatus.LOBBY);
        assertThat(empty.getLifecycle()).isEqualTo(LifecycleStatus.REMOVED);
        assertThat(abandoned.getLifecycle()).isEqualTo(LifecycleStatus.REMOVED);
    }

    // ─── Memory bounds ───────────────────────────────────────────────────────

    @Test
    void votingHistoryIsBoundedToConfiguredCap() throws Exception {
        String code = "LIFE7";
        startedRoom("vh", code, "9103");

        // Drive full meeting cycles until the game ends. Every VOTING→RESULT
        // transition appends one round to the room's voting history.
        for (int round = 0; round < 4 && room(code).getGameState().getPhase() != com.gonosia.game.model.Phase.GAME_OVER; round++) {
            advance(code); // INTRO/DISCUSSION → VOTING
            advance(code); // VOTING → RESULT (records round)
            assertThat(room(code).getVotingHistory().size())
                    .as("voting history stays at the configured cap")
                    .isLessThanOrEqualTo(2);
            advance(code); // RESULT → CRYOSLEEP
            advance(code); // CRYOSLEEP → WARP (or GAME_OVER)
            if (room(code).getGameState().getPhase() != com.gonosia.game.model.Phase.GAME_OVER) {
                advance(code); // WARP → DISCUSSION (or GAME_OVER after the kill)
            }
        }

        // Multiple rounds were recorded and still only the cap is retained.
        assertThat(room(code).getVotingHistory().size()).isEqualTo(2);
        assertThat(room(code).getVotingHistory().get(0)).isNotNull();
        assertThat(room(code).getVotingHistory().get(1)).isNotNull();
    }

    // ─── STOMP plumbing (mirrors TimerBroadcastIntegrationTest) ──────────────

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