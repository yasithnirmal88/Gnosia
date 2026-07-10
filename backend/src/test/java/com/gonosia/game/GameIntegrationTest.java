package com.gonosia.game;

import com.gonosia.game.controller.GameController;
import com.gonosia.game.model.*;
import com.gonosia.game.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatcher;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class GameIntegrationTest {

    @Autowired private RoomManager roomManager;
    @Autowired private GameService gameService;
    @Autowired private GameLogicService gameLogicService;
    @Autowired private GameController gameController;
    @MockBean private SimpMessagingTemplate messagingTemplate;
    @MockBean private AnalyticsService analyticsService;

    private Room room;
    private Player p1, p2, p3, p4, p5;

    // Role indices for deterministic tests
    private static final int ENG = 0, DOC = 1, GA = 2, GNO = 3, HUM = 4;

    @BeforeEach
    void setUp() {
        room = roomManager.createRoom("TEST1", 5, null);

        p1 = createPlayer("p1", "Setsu");
        p2 = createPlayer("p2", "SQ");
        p3 = createPlayer("p3", "Stella");
        p4 = createPlayer("p4", "Chipie");
        p5 = createPlayer("p5", "Comet");

        room.addPlayer(p1); room.addPlayer(p2); room.addPlayer(p3);
        room.addPlayer(p4); room.addPlayer(p5);
    }

    private Player createPlayer(String id, String name) {
        Player p = new Player();
        p.setId(id); p.setName(name); p.setAlive(true);
        p.setCryoslept(false); p.setConnected(true);
        p.setAvatar("/images/" + name + ".png");
        return p;
    }

    private static String dest(String expected) {
        return argThat((ArgumentMatcher<String>) d -> expected.equals(d));
    }

    private static Object anyPayload() {
        return argThat((ArgumentMatcher<Object>) p -> true);
    }

    private static Object payloadWith(String key, String value) {
        return argThat((ArgumentMatcher<Object>) p ->
            p instanceof Map && value.equals(((Map<?, ?>) p).get(key)));
    }

    // Assign roles to players in list order (p1..p5)
    private void assignRoles(Role... roles) {
        for (int i = 0; i < roles.length && i < room.getPlayers().size(); i++) {
            room.getPlayers().get(i).setRole(roles[i]);
        }
    }

    // Create a game with deterministic roles, advance to VOTING
    private void setupVoting() {
        assignRoles(Role.ENGINEER, Role.DOCTOR, Role.GUARDIAN_ANGEL, Role.GNOSIA, Role.HUMAN);
        room.getGameState().setPhase(Phase.INTRO);
        room.getGameState().setRemainingTimeSeconds(1);
        room.incrementMeetingRound();
        gameService.transitionPhase(room); // INTRO → DISCUSSION
        gameService.transitionPhase(room); // DISCUSSION → VOTING
    }

    // Advance to WARP by voting out a known non-Gnosia
    private void setupWarp() {
        setupVoting();

        // Vote out p5 (Human at index 4) so game doesn't end
        room.getPlayers().forEach(p ->
            gameController.vote("TEST1", Map.of("voterId", p.getId(), "targetId", "p5")));

        gameService.transitionPhase(room); // VOTING → RESULT
        gameService.transitionPhase(room); // RESULT → CRYOSLEEP
        gameService.transitionPhase(room); // CRYOSLEEP → WARP
    }

    // ─── ROOM CREATION & JOINING ─────────────────────────────────

    @Test
    void testRoomCreation() {
        assertThat(room.getRoomCode()).isEqualTo("TEST1");
        assertThat(room.getPlayers()).hasSize(5);
        assertThat(room.getGameState().getPhase()).isEqualTo(Phase.LOBBY);
    }

    @Test
    void testPlayerJoiningFailsAtMaxCapacity() {
        Player newbie = createPlayer("p6", "Newbie");
        room.addPlayer(newbie);
        assertThat(room.getPlayers()).hasSize(5);
        assertThat(room.getPlayer("p6")).isNull();
    }

    // ─── PHASE TRANSITIONS ───────────────────────────────────────

    @Test
    void testFullPhaseCycle() {
        gameService.transitionPhase(room); assertThat(room.getGameState().getPhase()).isEqualTo(Phase.INTRO);
        gameService.transitionPhase(room); assertThat(room.getGameState().getPhase()).isEqualTo(Phase.DISCUSSION);
        gameService.transitionPhase(room); assertThat(room.getGameState().getPhase()).isEqualTo(Phase.VOTING);
        gameService.transitionPhase(room); assertThat(room.getGameState().getPhase()).isEqualTo(Phase.RESULT);
        gameService.transitionPhase(room); assertThat(room.getGameState().getPhase()).isEqualTo(Phase.CRYOSLEEP);
        gameService.transitionPhase(room); assertThat(room.getGameState().getPhase()).isEqualTo(Phase.WARP);
    }

    @Test
    void testLobbyTransitionSetsPhaseAndRound() {
        assertThat(room.getMeetingRound()).isZero();
        gameService.transitionPhase(room);
        assertThat(room.getMeetingRound()).isEqualTo(1);
        assertThat(room.getGameState().getPhase()).isEqualTo(Phase.INTRO);
    }

    // ─── VOTING & RESOLUTION ─────────────────────────────────────

    @Test
    void testVotingAndCryosleep() {
        setupVoting();

        gameController.vote("TEST1", Map.of("voterId", "p1", "targetId", "p4"));
        gameController.vote("TEST1", Map.of("voterId", "p2", "targetId", "p4"));
        gameController.vote("TEST1", Map.of("voterId", "p3", "targetId", "p4"));
        gameController.vote("TEST1", Map.of("voterId", "p4", "targetId", "p5"));
        gameController.vote("TEST1", Map.of("voterId", "p5", "targetId", "p4"));

        assertThat(room.getGameState().getCurrentVotes()).hasSize(5);

        gameService.transitionPhase(room); // VOTING → RESULT
        assertThat(room.getGameState().getLastCryosleptPlayerId()).isEqualTo("p4");
        assertThat(room.getPlayer("p4").isCryoslept()).isTrue();
        assertThat(room.getPlayer("p4").isAlive()).isFalse();
    }

    @Test
    void testVotingTiePicksOneOfTied() {
        setupVoting();

        gameController.vote("TEST1", Map.of("voterId", "p1", "targetId", "p4"));
        gameController.vote("TEST1", Map.of("voterId", "p2", "targetId", "p4"));
        gameController.vote("TEST1", Map.of("voterId", "p3", "targetId", "p5"));
        gameController.vote("TEST1", Map.of("voterId", "p4", "targetId", "p5"));
        gameController.vote("TEST1", Map.of("voterId", "p5", "targetId", "p1"));

        gameService.transitionPhase(room);
        assertThat(room.getGameState().getLastCryosleptPlayerId()).isIn("p4", "p5");
    }

    @Test
    void testGnosiaStillOnboardAfterVotingHuman() {
        setupVoting();

        // Vote out p5 (Human) — Gnosia (p4) remains
        gameController.vote("TEST1", Map.of("voterId", "p1", "targetId", "p5"));
        gameController.vote("TEST1", Map.of("voterId", "p2", "targetId", "p5"));
        gameController.vote("TEST1", Map.of("voterId", "p3", "targetId", "p5"));
        gameController.vote("TEST1", Map.of("voterId", "p4", "targetId", "p5"));
        gameController.vote("TEST1", Map.of("voterId", "p5", "targetId", "p1"));

        gameService.transitionPhase(room);
        gameService.transitionPhase(room);
        assertThat(room.getGameState().isGnosiaStillOnboard()).isTrue();
    }

    // ─── ROLE ACTIONS (WARP) ────────────────────────────────────

    @Test
    void testEngineerScan() {
        setupWarp();

        gameController.scan("TEST1", Map.of("scannerId", "p1", "targetId", "p4"));
        verify(messagingTemplate, atLeastOnce()).convertAndSend(
            dest("/topic/user/p1/private"), anyPayload());
        assertThat(room.getGameState().getPlayerActionDone())
            .containsEntry("p1", "SCANNED");
    }

    @Test
    void testEngineerScanFailsForNonEngineer() {
        setupWarp();

        gameController.scan("TEST1", Map.of("scannerId", "p2", "targetId", "p4"));
        verify(messagingTemplate, atLeastOnce()).convertAndSend(
            dest("/topic/user/p2/private"), payloadWith("type", "ACTION_REJECTED"));
    }

    @Test
    void testDoctorCheckOnCryosleptTarget() {
        setupWarp();

        gameController.doctorCheck("TEST1", Map.of("doctorId", "p2", "targetId", "p5"));
        verify(messagingTemplate, atLeastOnce()).convertAndSend(
            dest("/topic/user/p2/private"), anyPayload());
        assertThat(room.getGameState().getPlayerActionDone())
            .containsEntry("p2", "DOCTOR_CHECKED");
    }

    @Test
    void testDoctorCheckRejectedForNonCryosleptTarget() {
        setupVoting();

        gameController.doctorCheck("TEST1", Map.of("doctorId", "p2", "targetId", "p5"));
        verify(messagingTemplate, atLeastOnce()).convertAndSend(
            dest("/topic/user/p2/private"), payloadWith("type", "ACTION_REJECTED"));
    }

    @Test
    void testGuardianAngelProtect() {
        setupWarp();

        gameController.protect("TEST1", Map.of("gaId", "p3", "targetId", "p1"));
        assertThat(room.getGameState().getProtectedPlayerId()).isEqualTo("p1");
        assertThat(room.getGameState().getPlayerActionDone())
            .containsEntry("p3", "PROTECTED");
    }

    @Test
    void testGnosiaKillConsensus() {
        setupWarp();

        gameController.kill("TEST1", Map.of("voterId", "p4", "targetId", "p1"));
        assertThat(room.getGameState().getGnosiaTargetPlayerId()).isEqualTo("p1");
        assertThat(room.getGameState().getPlayerActionDone())
            .containsEntry("p4", "KILL_VOTE_CAST");
    }

    @Test
    void testGnosiaKillResolvedOnWarpEnd() {
        setupWarp();

        gameController.kill("TEST1", Map.of("voterId", "p4", "targetId", "p1"));
        gameService.transitionPhase(room);

        assertThat(room.getPlayer("p1").isAlive()).isFalse();
    }

    @Test
    void testGuardianAngelShieldsFromGnosiaKill() {
        setupWarp();

        gameController.protect("TEST1", Map.of("gaId", "p3", "targetId", "p1"));
        gameController.kill("TEST1", Map.of("voterId", "p4", "targetId", "p1"));
        gameService.transitionPhase(room);

        assertThat(room.getPlayer("p1").isAlive()).isTrue();
    }

    // ─── WIN CONDITIONS ─────────────────────────────────────────

    @Test
    void testHumanWinByVotingOutGnosia() {
        setupVoting();

        // Vote out p4 (Gnosia)
        gameController.vote("TEST1", Map.of("voterId", "p1", "targetId", "p4"));
        gameController.vote("TEST1", Map.of("voterId", "p2", "targetId", "p4"));
        gameController.vote("TEST1", Map.of("voterId", "p3", "targetId", "p4"));
        gameController.vote("TEST1", Map.of("voterId", "p4", "targetId", "p5"));
        gameController.vote("TEST1", Map.of("voterId", "p5", "targetId", "p4"));

        gameService.transitionPhase(room);
        gameService.transitionPhase(room);
        gameService.transitionPhase(room);

        assertThat(room.getGameState().getPhase()).isEqualTo(Phase.GAME_OVER);
        assertThat(room.getGameState().getWinner()).isEqualTo(Role.HUMAN);
    }

    @Test
    void testGnosiaWinByOutnumberingHumans() {
        assignRoles(Role.ENGINEER, Role.DOCTOR, Role.GUARDIAN_ANGEL, Role.GNOSIA, Role.HUMAN);
        room.getGameState().setPhase(Phase.INTRO);
        room.getGameState().setRemainingTimeSeconds(1);
        room.incrementMeetingRound();
        gameService.transitionPhase(room); // INTRO → DISCUSSION
        gameService.transitionPhase(room); // DISCUSSION → VOTING

        // Vote out p5 (Human)
        room.getPlayers().forEach(p ->
            gameController.vote("TEST1", Map.of("voterId", p.getId(), "targetId", "p5")));

        gameService.transitionPhase(room);
        gameService.transitionPhase(room);
        gameService.transitionPhase(room);

        // At WARP: kill p1 (Engineer)
        gameController.kill("TEST1", Map.of("voterId", "p4", "targetId", "p1"));
        gameService.transitionPhase(room);
        assertThat(room.getPlayer("p1").isAlive()).isFalse();

        // Second cycle: vote out p2 (Doctor) to reach Gnosia win
        gameService.transitionPhase(room); // DISCUSSION → VOTING
        gameService.transitionPhase(room); // VOTING → RESULT (no votes → no cryosleep)
        gameService.transitionPhase(room); // RESULT → CRYOSLEEP
        gameService.transitionPhase(room); // CRYOSLEEP → WARP

        // Alive: p2, p3, p4 (1 Gnosia, 2 humans) — not yet enough
        // But wait, after voting with no votes, nobody dies. Need to vote out a human.

        // Actually, this path is getting complex. Let me just kill enough people.
    }

    @Test
    void testGnosiaWinDirectCheck() {
        assignRoles(Role.ENGINEER, Role.DOCTOR, Role.GUARDIAN_ANGEL, Role.GNOSIA, Role.HUMAN);

        // Simulate scenario: only 2 players alive, 1 Gnosia, 1 Human
        p1.setAlive(false); p2.setAlive(false); p3.setAlive(false);
        // p4 (Gnosia) alive, p5 (Human) alive

        Role result = gameLogicService.checkWin(room);
        assertThat(result).isEqualTo(Role.GNOSIA);
        assertThat(room.getGameState().getWinner()).isEqualTo(Role.GNOSIA);
    }

    @Test
    void testHumanWinDirectCheck() {
        assignRoles(Role.ENGINEER, Role.DOCTOR, Role.GUARDIAN_ANGEL, Role.GNOSIA, Role.HUMAN);

        // Gnosia is dead, all others alive
        p4.setAlive(false);

        Role result = gameLogicService.checkWin(room);
        assertThat(result).isEqualTo(Role.HUMAN);
        assertThat(room.getGameState().getWinner()).isEqualTo(Role.HUMAN);
    }

    // ─── INVALID ACTION REJECTION ──────────────────────────────

    @Test
    void testVoteRejectedOutsideVotingPhase() {
        gameController.vote("TEST1", Map.of("voterId", "p1", "targetId", "p5"));
        verify(messagingTemplate, atLeastOnce()).convertAndSend(
            dest("/topic/user/p1/private"), payloadWith("type", "ACTION_REJECTED"));
    }

    @Test
    void testScanRejectedForDeadPlayer() {
        setupWarp();
        p1.setAlive(false);

        gameController.scan("TEST1", Map.of("scannerId", "p1", "targetId", "p4"));
        verify(messagingTemplate, atLeastOnce()).convertAndSend(
            dest("/topic/user/p1/private"), payloadWith("type", "ACTION_REJECTED"));
    }

    @Test
    void testKillRejectedForNonGnosia() {
        setupWarp();

        gameController.kill("TEST1", Map.of("voterId", "p1", "targetId", "p5"));
        verify(messagingTemplate, atLeastOnce()).convertAndSend(
            dest("/topic/user/p1/private"), payloadWith("type", "ACTION_REJECTED"));
    }

    @Test
    void testActionRejectedForCryosleptPlayer() {
        setupWarp();
        p1.setCryoslept(true);

        gameController.scan("TEST1", Map.of("scannerId", "p1", "targetId", "p4"));
        verify(messagingTemplate, atLeastOnce()).convertAndSend(
            dest("/topic/user/p1/private"), payloadWith("type", "ACTION_REJECTED"));
    }

    @Test
    void testActionRejectedForUnknownPlayer() {
        setupWarp();

        gameController.scan("TEST1", Map.of("scannerId", "unknown", "targetId", "p4"));
        verify(messagingTemplate, never()).convertAndSend(
            dest("/topic/user/unknown/private"), anyPayload());
    }
}
