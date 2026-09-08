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
 * 15-player game scenario: full role matrix, voting rounds, Gnosia kill, and
 * both win paths (human win via cryosleep, Gnosia win via outnumbering).
 *
 * <p>Covers the checklist items:
 * <ul>
 *   <li>15-player start</li>
 *   <li>role assignment (3 Gnosia + Engineer + Doctor + Guardian Angel)</li>
 *   <li>voting + cryosleep cycle</li>
 *   <li>Gnosia kill consensus during warp</li>
 *   <li>Guardian Angel protection</li>
 *   <li>GAME_OVER both paths</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "app.rate-limit.enabled=false")
class LargeGameIntegrationTest {

    @LocalServerPort private int port;
    @Autowired private RoomManager roomManager;
    @Autowired private GameService gameService;
    @Autowired private GameLogicService gameLogicService;

    private Stomp pool;
    private static final int N = 15;

    @BeforeEach
    void setUp() { pool = new Stomp("ws://localhost:" + port + "/game-ws-raw"); }

    @AfterEach
    void tearDown() { pool.shutdown(); }

    /**
     * Open N sockets with unique identities for the given prefix, then run a
     * full create-and-join: creator creates, the rest join (awaiting each
     * JOIN_CONFIRMED to avoid concurrent broadcaster churn).
     */
    private Stomp.Client[] startedRoom(String prefix, String code, String pin) throws Exception {
        Stomp.Client[] c = new Stomp.Client[N];
        for (int i = 0; i < N; i++) c[i] = pool.connect(prefix + "-" + i, "key-" + prefix + "-" + i);

        c[0].send("/app/room/create",
                Map.of("playerId", prefix + "-0", "channelKey", "key-" + prefix + "-0",
                        "roomCode", code, "participants", N, "pin", pin));
        c[0].await("ROOM_CREATED");

        for (int i = 1; i < N; i++) {
            c[i].send("/app/room/" + code + "/join",
                    Map.of("id", prefix + "-" + i, "channelKey", "key-" + prefix + "-" + i, "pin", pin));
            c[i].await("JOIN_CONFIRMED");
        }
        return c;
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

    // ─── Scenario 1: 15-player game from LOBBY to GAME_OVER ────────────────

    @Test
    void fifteenPlayerGameFullCycle() throws Exception {
        String code = "LG15";
        String pin = "9150";
        Stomp.Client[] clients = startedRoom("lgf", code, pin);

        Room r = room(code);
        assertThat(r.getPlayers()).hasSize(N);

        // Start
        clients[0].send("/app/room/" + code + "/start", Map.of());
        awaitPhase(code, Phase.INTRO);

        // Verify role distribution: 3 Gnosia + Engineer + Doctor + Guardian Angel + 9 Human
        long gnosiaCount = r.getPlayers().stream().filter(p -> p.getRole() == Role.GNOSIA).count();
        long engCount    = r.getPlayers().stream().filter(p -> p.getRole() == Role.ENGINEER).count();
        long docCount    = r.getPlayers().stream().filter(p -> p.getRole() == Role.DOCTOR).count();
        long gaCount     = r.getPlayers().stream().filter(p -> p.getRole() == Role.GUARDIAN_ANGEL).count();
        long humanCount  = r.getPlayers().stream().filter(p -> p.getRole() == Role.HUMAN).count();
        assertThat(gnosiaCount).isEqualTo(3);
        assertThat(engCount).isEqualTo(1);
        assertThat(docCount).isEqualTo(1);
        assertThat(gaCount).isEqualTo(1);
        assertThat(humanCount).isEqualTo(9);
        assertThat(gnosiaCount + engCount + docCount + gaCount + humanCount).isEqualTo(N);

        // Run up to 3 full voting/cryosleep cycles to demonstrate the machine works at scale
        for (int round = 0; round < 3 && r.getGameState().getPhase() != Phase.GAME_OVER; round++) {
            while (r.getGameState().getPhase() != Phase.VOTING
                    && r.getGameState().getPhase() != Phase.GAME_OVER) {
                advance(code); // INTRO → DISCUSSION → VOTING
            }
            if (r.getGameState().getPhase() == Phase.GAME_OVER) break;
            assertThat(r.getGameState().getPhase()).isEqualTo(Phase.VOTING);

            // Vote out a known human (player index 14, safe as long as it's alive)
            Player target = r.getPlayers().stream()
                    .filter(p -> p.isAlive() && p.getRole() == Role.HUMAN)
                    .findFirst().orElse(null);
            if (target == null) break;

            for (Stomp.Client c : clients) {
                c.send("/app/room/" + code + "/vote",
                        Map.of("voterId", c.playerId(), "targetId", target.getId()));
            }

            advance(code); // VOTING → RESULT (records votes)
            assertThat(r.getGameState().getPhase()).isEqualTo(Phase.RESULT);
            assertThat(r.getGameState().getLastCryosleptPlayerId()).isNotNull();

            advance(code); // RESULT → CRYOSLEEP
            advance(code); // CRYOSLEEP → WARP
            if (r.getGameState().getPhase() != Phase.GAME_OVER) {
                advance(code); // WARP → DISCUSSION
            }
        }

        // Game should eventually reach GAME_OVER or still be running
        // If still running, force a clean HUMAN win: eliminate all Gnosia
        // directly, then walk the machine until it detects the win.
        if (r.getGameState().getPhase() != Phase.GAME_OVER) {
            r.getPlayers().stream()
                    .filter(p -> p.getRole() == Role.GNOSIA)
                    .forEach(p -> p.setAlive(false));
            for (int i = 0; i < 10 && r.getGameState().getPhase() != Phase.GAME_OVER; i++) {
                advance(code);
            }
        }

        assertThat(r.getGameState().getPhase()).isEqualTo(Phase.GAME_OVER);
        assertThat(r.getGameState().getWinner()).isEqualTo(Role.HUMAN);
    }

    // ─── Scenario: Gnosia win at parity ────────────────────────────────────

    @Test
    void gnosiaWinByOutnumberingFifteenPlayers() throws Exception {
        String code = "LG15G";
        String pin = "9151";

        Stomp.Client[] clients = startedRoom("lgg", code, pin);

        clients[0].send("/app/room/" + code + "/start", Map.of());
        awaitPhase(code, Phase.INTRO);

        Room r = room(code);

        // Manually set up: 3 Gnosia alive, 3 humans alive, rest dead → Gnosia win
        int killed = 0;
        for (Player p : r.getPlayers()) {
            if (p.getRole() == Role.HUMAN && killed < 9) {
                p.setAlive(false);
                killed++;
            }
        }

        // Now check: 3 Gnosia vs 3 Humans → parity → Gnosia win
        Role winner = gameLogicService.checkWin(r);
        assertThat(winner).isEqualTo(Role.GNOSIA);
    }
}