package com.gonosia.game;

import com.gonosia.game.model.*;
import com.gonosia.game.service.*;
import com.gonosia.game.support.Stomp;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Scenario 2: multiple simultaneous rooms. Verifies that game state, voting,
 * and phase transitions are fully isolated between rooms running concurrently.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "app.rate-limit.enabled=false")
class MultiRoomIntegrationTest {

    @LocalServerPort private int port;
    @Autowired private RoomManager roomManager;
    @Autowired private GameService gameService;

    private Stomp pool;

    @BeforeEach
    void setUp() { pool = new Stomp("ws://localhost:" + port + "/game-ws-raw"); }

    @AfterEach
    void tearDown() { pool.shutdown(); }

    /**
     * Open 5 sockets for two rooms (prefixA/prefixB), create+join+start each.
     */
    private Stomp.Client[][] twoRooms(String prefixA, String codeA, String pinA,
                                      String prefixB, String codeB, String pinB) throws Exception {
        Stomp.Client[] a = connectGroup(prefixA, 5);
        Stomp.Client[] b = connectGroup(prefixB, 5);
        createAndStartRoom(a, prefixA, codeA, pinA);
        createAndStartRoom(b, prefixB, codeB, pinB);
        return new Stomp.Client[][]{a, b};
    }

    private Stomp.Client[] connectGroup(String prefix, int n) {
        Stomp.Client[] clients = new Stomp.Client[n];
        for (int i = 0; i < n; i++) clients[i] = pool.connect(prefix + "-" + i, "key-" + prefix + "-" + i);
        return clients;
    }

    private Room room(String code) {
        Room r = roomManager.getRoom(code);
        assertThat(r).as("room " + code).isNotNull();
        return r;
    }

    private void advance(String code) {
        Room r = room(code);
        if (r.getGameState().getPhase() != Phase.LOBBY && r.getGameState().getPhase() != Phase.GAME_OVER)
            r.getGameState().setRemainingTimeSeconds(3600);
        gameService.transitionPhase(r);
    }

    private void awaitPhase(String code, Phase phase) throws Exception {
        long deadline = System.currentTimeMillis() + 8000;
        while (System.currentTimeMillis() < deadline) {
            Room r = roomManager.getRoom(code);
            if (r != null && r.getGameState().getPhase() == phase) return;
            Thread.sleep(100);
        }
        throw new AssertionError("Room " + code + " never reached " + phase);
    }

    private void createAndStartRoom(Stomp.Client[] clients, String prefix, String code, String pin) throws Exception {
        clients[0].send("/app/room/create",
                Map.of("playerId", prefix + "-0", "channelKey", "key-" + prefix + "-0",
                        "roomCode", code, "participants", 5, "pin", pin));
        clients[0].await("ROOM_CREATED");
        for (int i = 1; i < 5; i++) {
            clients[i].send("/app/room/" + code + "/join",
                    Map.of("id", prefix + "-" + i, "channelKey", "key-" + prefix + "-" + i, "pin", pin));
            clients[i].await("JOIN_CONFIRMED");
        }
        clients[0].send("/app/room/" + code + "/start", Map.of());
        awaitPhase(code, Phase.INTRO);
    }

    @Test
    void twoRoomsRunIndependentlyToGameOver() throws Exception {
        String codeA = "MRA1", codeB = "MRB1";
        Stomp.Client[][] g = twoRooms("ra", codeA, "8201", "rb", codeB, "8202");
        Stomp.Client[] roomA = g[0], roomB = g[1];

        Room rA = room(codeA), rB = room(codeB);

        // Both rooms in INTRO — phases are independent
        assertThat(rA.getGameState().getPhase()).isEqualTo(Phase.INTRO);
        assertThat(rB.getGameState().getPhase()).isEqualTo(Phase.INTRO);

        // Room A: advance to VOTING, Room B stays in INTRO
        advance(codeA); // INTRO → DISCUSSION
        advance(codeA); // DISCUSSION → VOTING
        assertThat(rA.getGameState().getPhase()).isEqualTo(Phase.VOTING);
        assertThat(rB.getGameState().getPhase()).isEqualTo(Phase.INTRO);

        // Room A: vote out a human
        Player targetA = rA.getPlayers().stream()
                .filter(p -> p.getRole() == Role.HUMAN).findFirst().orElseThrow();
        for (Stomp.Client c : roomA) {
            c.send("/app/room/" + codeA + "/vote",
                    Map.of("voterId", c.playerId(), "targetId", targetA.getId()));
        }
        advance(codeA); // VOTING → RESULT (records votes)
        assertThat(rA.getGameState().getPhase()).isEqualTo(Phase.RESULT);

        // Room B still undisturbed
        assertThat(rB.getGameState().getPhase()).isEqualTo(Phase.INTRO);

        // Finish Room A through to GAME_OVER (repeat rounds until the win check fires)
        driveToGameOver(roomA, codeA, rA);

        // Now advance Room B: start (still INTRO since untouched) and drive to GAME_OVER
        driveToGameOver(roomB, codeB, rB);

        // Both reached GAME_OVER — and the winner may differ
        assertThat(rA.getGameState().getPhase()).isEqualTo(Phase.GAME_OVER);
        assertThat(rB.getGameState().getPhase()).isEqualTo(Phase.GAME_OVER);
        assertThat(rA.getGameState().getWinner()).isNotNull();
        assertThat(rB.getGameState().getWinner()).isNotNull();
    }

    /** Walk a started room through full voting rounds until GAME_OVER. */
    private void driveToGameOver(Stomp.Client[] room, String code, Room r) throws Exception {
        for (int round = 0; round < 12 && r.getGameState().getPhase() != Phase.GAME_OVER; round++) {
            // Advance to VOTING from wherever we are
            while (r.getGameState().getPhase() != Phase.VOTING
                    && r.getGameState().getPhase() != Phase.GAME_OVER) {
                advance(code);
            }
            if (r.getGameState().getPhase() == Phase.GAME_OVER) break;

            Player target = r.getPlayers().stream()
                    .filter(p -> p.isAlive() && p.getRole() == Role.HUMAN)
                    .findFirst().orElse(null);
            if (target == null) { advance(code); continue; }

            for (Stomp.Client c : room) {
                c.send("/app/room/" + code + "/vote",
                        Map.of("voterId", c.playerId(), "targetId", target.getId()));
            }
            advance(code); // VOTING → RESULT
            advance(code); // RESULT → CRYOSLEEP
            advance(code); // CRYOSLEEP → WARP
            if (r.getGameState().getPhase() != Phase.GAME_OVER) {
                advance(code); // WARP → DISCUSSION or GAME_OVER
            }
        }
    }

    @Test
    void roomARemovedDoesNotAffectRoomB() throws Exception {
        String codeA = "MRC1", codeB = "MRD1";
        Stomp.Client[][] g = twoRooms("rc", codeA, "8203", "rd", codeB, "8204");

        Room rA = room(codeA), rB = room(codeB);
        assertThat(rA.getPlayers()).hasSize(5);
        assertThat(rB.getPlayers()).hasSize(5);

        // Remove Room A from the manager
        roomManager.removeRoom(codeA);
        assertThat(roomManager.getRoom(codeA)).isNull();

        // Room B still exists and is unaffected
        Room rBStill = room(codeB);
        assertThat(rBStill.getGameState().getPhase()).isNotEqualTo(Phase.GAME_OVER);

        // Can still advance Room B
        advance(codeB);
        assertThat(rBStill.getGameState().getPhase()).isEqualTo(Phase.DISCUSSION);
    }
}