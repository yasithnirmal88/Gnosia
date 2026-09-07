package com.gonosia.game;

import com.gonosia.game.model.*;
import com.gonosia.game.controller.GameController;
import com.gonosia.game.security.GameActionAuthorizationService;
import com.gonosia.game.security.SessionIdentityService;
import com.gonosia.game.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatcher;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * Comprehensive negative tests for every game action, exercising the full
 * GameActionAuthorizationService gate chain. Covers:
 *   unauthorized player, wrong role, wrong phase, dead player,
 *   cryoslept player, invalid target, cross-room target, repeated action,
 *   and spoofed actor ID — for every action endpoint.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class GameActionAuthorizationTest {

    @Autowired private RoomManager roomManager;
    @Autowired private GameService gameService;
    @Autowired private GameController gameController;
    @Autowired private SessionIdentityService identityService;
    @Autowired private GameActionAuthorizationService authorizationService;
    @MockBean private SimpMessagingTemplate messagingTemplate;
    @MockBean private AnalyticsService analyticsService;

    private Room room;
    private Player p1, p2, p3, p4, p5;

    // Indices: p1=ENGINEER, p2=DOCTOR, p3=GUARDIAN_ANGEL, p4=GNOSIA, p5=HUMAN
    private static final int ENG = 0, DOC = 1, GA = 2, GNO = 3, HUM = 4;

    @BeforeEach
    void setUp() {
        room = roomManager.createRoom("TEST1", 5, null);
        p1 = createPlayer("p1", "Setsu",  Role.ENGINEER);
        p2 = createPlayer("p2", "SQ",     Role.DOCTOR);
        p3 = createPlayer("p3", "Stella", Role.GUARDIAN_ANGEL);
        p4 = createPlayer("p4", "Chipie", Role.GNOSIA);
        p5 = createPlayer("p5", "Comet",  Role.HUMAN);
        room.addPlayer(p1); room.addPlayer(p2); room.addPlayer(p3);
        room.addPlayer(p4); room.addPlayer(p5);

        identityService.claim("s1", "p1", "test-key-p1", "TEST1");
        identityService.claim("s2", "p2", "test-key-p2", "TEST1");
        identityService.claim("s3", "p3", "test-key-p3", "TEST1");
        identityService.claim("s4", "p4", "test-key-p4", "TEST1");
        identityService.claim("s5", "p5", "test-key-p5", "TEST1");

        room.getGameState().setPhase(Phase.WARP);
        room.getGameState().setRemainingTimeSeconds(3600);
        room.incrementMeetingRound(); // meetingRound=1, required by gameService transition logic
    }

    // ─── helpers ──────────────────────────────────────────────────────────

    private Player createPlayer(String id, String name, Role role) {
        Player p = new Player();
        p.setId(id); p.setName(name); p.setRole(role);
        p.setAlive(true); p.setCryoslept(false); p.setConnected(true);
        p.setAvatar("/images/" + name + ".png");
        return p;
    }

    private void makeDead(String id) {
        room.getPlayer(id).setAlive(false);
        room.getPlayer(id).setCryoslept(false);
    }

    private void makeCryoslept(String id) {
        room.getPlayer(id).setAlive(false);
        room.getPlayer(id).setCryoslept(true);
    }

    private void setPhase(Phase phase) {
        room.getGameState().setPhase(phase);
        room.getGameState().setRemainingTimeSeconds(3600);
    }

    private static String key(String playerId) {
        return "test-key-" + playerId;
    }

    private static String session(String playerId) {
        return "s" + playerId.replace("p", "");
    }

    private SimpMessageHeaderAccessor h(String sessionId) {
        SimpMessageHeaderAccessor accessor = SimpMessageHeaderAccessor.create();
        accessor.setSessionId(sessionId);
        return accessor;
    }

    // ─── mock matchers ────────────────────────────────────────────────────

    private static String dest(String expected) {
        return argThat((ArgumentMatcher<String>) d -> expected.equals(d));
    }

    private static Object payloadWith(String k, String v) {
        return argThat((ArgumentMatcher<Object>) p ->
            p instanceof Map && v.equals(((Map<?, ?>) p).get(k)));
    }

    private void assertRejected(String playerId, String action) {
        verify(messagingTemplate, atLeastOnce()).convertAndSend(
            dest("/topic/private/" + key(playerId)),
            payloadWith("type", "ACTION_REJECTED"));
    }

    private void assertNotRejected(String playerId) {
        verify(messagingTemplate, never()).convertAndSend(
            dest("/topic/private/" + key(playerId)),
            payloadWith("type", "ACTION_REJECTED"));
    }

    private void assertNoRejectionAnywhere() {
        verify(messagingTemplate, never()).convertAndSend(
            anyString(), payloadWith("type", "ACTION_REJECTED"));
    }

    private void assertActionDone(String playerId, String marker) {
        assertThat(room.getGameState().getPlayerActionDone())
            .containsEntry(playerId, marker);
    }

    private void assertActionNotDone(String playerId) {
        assertThat(room.getGameState().getPlayerActionDone())
            .doesNotContainKey(playerId);
    }

    /** Create an external room with a known player to test cross-room targeting. */
    private Room seedExternalRoom() {
        Room r = roomManager.createRoom("TESTX", 5, null);
        Player ext = new Player();
        ext.setId("ext-1"); ext.setName("External"); ext.setAlive(true);
        ext.setConnected(true); ext.setAvatar("/images/ext.png");
        r.addPlayer(ext);
        return r;
    }

    // ══════════════════════════════════════════════════════════════════════
    //                          S T A R T
    // ══════════════════════════════════════════════════════════════════════

    @Test
    void testStartUnauthorizedSilent() {
        // Create a separate room and an unbound session
        Room r2 = roomManager.createRoom("ST02", 5, null);
        r2.getGameState().setRemainingTimeSeconds(3600);
        gameController.startGame("ST02", h("s99"));
        assertNoRejectionAnywhere();
    }

    @Test
    void testStartWrongPhaseRejected() {
        setPhase(Phase.INTRO);
        gameController.startGame("TEST1", h("s1"));
        assertRejected("p1", "START");
    }

    @Test
    void testStartNotFullRejected() {
        Room r2 = roomManager.createRoom("ST03", 5, null);
        r2.getGameState().setPhase(Phase.LOBBY);
        r2.getGameState().setRemainingTimeSeconds(3600);
        Player only = new Player();
        only.setId("st-a"); only.setName("Solo"); only.setAlive(true);
        only.setConnected(true); only.setAvatar("/images/default.png");
        r2.addPlayer(only);
        identityService.claim("s-st-a", "st-a", "test-key-st-a", "ST03");

        gameController.startGame("ST03", h("s-st-a"));
        assertRejected("st-a", "START");
    }

    @Test
    void testStartAfterGameOverRejected() {
        setPhase(Phase.GAME_OVER);
        gameController.startGame("TEST1", h("s1"));
        assertRejected("p1", "START");
    }

    // ══════════════════════════════════════════════════════════════════════
    //                          V O T E
    // ══════════════════════════════════════════════════════════════════════

    @Test
    void testVoteUnauthorizedSilent() {
        setPhase(Phase.VOTING);
        gameController.vote("TEST1", Map.of("targetId", "p2"), h("s99"));
        assertNoRejectionAnywhere();
        assertThat(room.getGameState().getCurrentVotes()).isEmpty();
    }

    @Test
    void testVoteWrongPhaseRejected() {
        setPhase(Phase.DISCUSSION);
        gameController.vote("TEST1", Map.of("targetId", "p2"), h("s1"));
        assertRejected("p1", "VOTE");
        assertActionNotDone("p1");
    }

    @Test
    void testVoteByEveryRoleAllowed() {
        setPhase(Phase.VOTING);
        gameController.vote("TEST1", Map.of("targetId", "p2"), h("s1")); // ENG
        gameController.vote("TEST1", Map.of("targetId", "p1"), h("s2")); // DOC
        gameController.vote("TEST1", Map.of("targetId", "p1"), h("s3")); // GA
        gameController.vote("TEST1", Map.of("targetId", "p1"), h("s4")); // GNO
        gameController.vote("TEST1", Map.of("targetId", "p1"), h("s5")); // HUM
        assertNotRejected("p1");
        assertNotRejected("p2");
        assertNotRejected("p3");
        assertNotRejected("p4");
        assertNotRejected("p5");
        assertThat(room.getGameState().getCurrentVotes()).hasSize(5);
    }

    @Test
    void testVoteDeadPlayerRejected() {
        setPhase(Phase.VOTING);
        makeDead("p1");
        gameController.vote("TEST1", Map.of("targetId", "p2"), h("s1"));
        assertRejected("p1", "VOTE");
        assertActionNotDone("p1");
    }

    @Test
    void testVoteCryosleptPlayerRejected() {
        setPhase(Phase.VOTING);
        makeCryoslept("p1");
        gameController.vote("TEST1", Map.of("targetId", "p2"), h("s1"));
        assertRejected("p1", "VOTE");
        assertActionNotDone("p1");
    }

    @Test
    void testVoteInvalidTargetRejected() {
        setPhase(Phase.VOTING);
        gameController.vote("TEST1", Map.of("targetId", "ghost"), h("s1"));
        assertRejected("p1", "VOTE");
        assertActionNotDone("p1");
    }

    @Test
    void testVoteCrossRoomTargetRejected() {
        seedExternalRoom();
        setPhase(Phase.VOTING);
        gameController.vote("TEST1", Map.of("targetId", "ext-1"), h("s1"));
        assertRejected("p1", "VOTE");
        assertActionNotDone("p1");
    }

    @Test
    void testVoteDeadTargetRejected() {
        setPhase(Phase.VOTING);
        makeDead("p2");
        gameController.vote("TEST1", Map.of("targetId", "p2"), h("s1"));
        assertRejected("p1", "VOTE");
        assertActionNotDone("p1");
    }

    @Test
    void testVoteRepeatedChangesVote() {
        setPhase(Phase.VOTING);
        gameController.vote("TEST1", Map.of("targetId", "p2"), h("s1"));
        gameController.vote("TEST1", Map.of("targetId", "p3"), h("s1"));
        assertNotRejected("p1");
        assertThat(room.getGameState().getCurrentVotes())
            .containsEntry("p1", "p3")
            .doesNotContainEntry("p1", "p2");
        assertActionDone("p1", "VOTED");
    }

    @Test
    void testVoteActorIdSpoofed() {
        setPhase(Phase.VOTING);
        // s1 spoofs voterId as p2, target is p3 — server must use session's p1
        gameController.vote("TEST1", Map.of("voterId", "p2", "targetId", "p3"), h("s1"));
        assertNotRejected("p1");
        assertThat(room.getGameState().getCurrentVotes())
            .containsEntry("p1", "p3")
            .doesNotContainKey("p2");
    }

    // ══════════════════════════════════════════════════════════════════════
    //                          S C A N
    // ══════════════════════════════════════════════════════════════════════

    @Test
    void testScanUnauthorizedSilent() {
        gameController.scan("TEST1", Map.of("targetId", "p4"), h("s99"));
        assertNoRejectionAnywhere();
        assertActionNotDone("p1");
    }

    @Test
    void testScanWrongRoleRejected() {
        // Doctor tries to scan
        gameController.scan("TEST1", Map.of("targetId", "p4"), h("s2"));
        assertRejected("p2", "SCAN");
        assertActionNotDone("p2");
    }

    @Test
    void testScanWrongPhaseRejected() {
        setPhase(Phase.VOTING);
        gameController.scan("TEST1", Map.of("targetId", "p4"), h("s1"));
        assertRejected("p1", "SCAN");
        assertActionNotDone("p1");
    }

    @Test
    void testScanDeadScannerRejected() {
        makeDead("p1");
        gameController.scan("TEST1", Map.of("targetId", "p4"), h("s1"));
        assertRejected("p1", "SCAN");
        assertActionNotDone("p1");
    }

    @Test
    void testScanCryosleptScannerRejected() {
        makeCryoslept("p1");
        gameController.scan("TEST1", Map.of("targetId", "p4"), h("s1"));
        assertRejected("p1", "SCAN");
        assertActionNotDone("p1");
    }

    @Test
    void testScanInvalidTargetRejected() {
        gameController.scan("TEST1", Map.of("targetId", "ghost"), h("s1"));
        assertRejected("p1", "SCAN");
        assertActionNotDone("p1");
    }

    @Test
    void testScanCrossRoomTargetRejected() {
        seedExternalRoom();
        gameController.scan("TEST1", Map.of("targetId", "ext-1"), h("s1"));
        assertRejected("p1", "SCAN");
        assertActionNotDone("p1");
    }

    @Test
    void testScanRepeatedActionRejected() {
        // First scan succeeds
        gameController.scan("TEST1", Map.of("targetId", "p4"), h("s1"));
        assertNotRejected("p1");
        assertActionDone("p1", "SCANNED");

        // Second scan rejected
        gameController.scan("TEST1", Map.of("targetId", "p2"), h("s1"));
        assertRejected("p1", "SCAN");
    }

    @Test
    void testScanActorIdSpoofed() {
        // s2 spoofs scannerId as p1 — must use p2 (the session's identity)
        gameController.scan("TEST1", Map.of("scannerId", "p1", "targetId", "p4"), h("s2"));
        assertRejected("p2", "SCAN");
        assertActionNotDone("p1");
        assertActionNotDone("p2");
    }

    // ══════════════════════════════════════════════════════════════════════
    //                      D O C T O R   C H E C K
    // ══════════════════════════════════════════════════════════════════════

    @Test
    void testDoctorCheckUnauthorizedSilent() {
        gameController.doctorCheck("TEST1", Map.of("targetId", "p5"), h("s99"));
        assertNoRejectionAnywhere();
    }

    @Test
    void testDoctorCheckWrongRoleRejected() {
        gameController.doctorCheck("TEST1", Map.of("targetId", "p5"), h("s1"));
        assertRejected("p1", "DOCTOR_CHECK");
    }

    @Test
    void testDoctorCheckWrongPhaseRejected() {
        setPhase(Phase.VOTING);
        gameController.doctorCheck("TEST1", Map.of("targetId", "p5"), h("s2"));
        assertRejected("p2", "DOCTOR_CHECK");
    }

    @Test
    void testDoctorCheckDeadDoctorRejected() {
        makeDead("p2");
        gameController.doctorCheck("TEST1", Map.of("targetId", "p5"), h("s2"));
        assertRejected("p2", "DOCTOR_CHECK");
    }

    @Test
    void testDoctorCheckCryosleptDoctorRejected() {
        makeCryoslept("p2");
        gameController.doctorCheck("TEST1", Map.of("targetId", "p5"), h("s2"));
        assertRejected("p2", "DOCTOR_CHECK");
    }

    @Test
    void testDoctorCheckInvalidTargetRejected() {
        gameController.doctorCheck("TEST1", Map.of("targetId", "ghost"), h("s2"));
        assertRejected("p2", "DOCTOR_CHECK");
    }

    @Test
    void testDoctorCheckCrossRoomTargetRejected() {
        seedExternalRoom();
        gameController.doctorCheck("TEST1", Map.of("targetId", "ext-1"), h("s2"));
        assertRejected("p2", "DOCTOR_CHECK");
    }

    @Test
    void testDoctorCheckTargetNotCryosleptRejected() {
        gameController.doctorCheck("TEST1", Map.of("targetId", "p5"), h("s2"));
        assertRejected("p2", "DOCTOR_CHECK");
    }

    @Test
    void testDoctorCheckRepeatedActionRejected() {
        makeCryoslept("p5");
        gameController.doctorCheck("TEST1", Map.of("targetId", "p5"), h("s2"));
        assertNotRejected("p2");
        assertActionDone("p2", "DOCTOR_CHECKED");

        // Second doctor check rejected
        makeCryoslept("p4");
        gameController.doctorCheck("TEST1", Map.of("targetId", "p4"), h("s2"));
        assertRejected("p2", "DOCTOR_CHECK");
    }

    @Test
    void testDoctorCheckActorIdSpoofed() {
        makeCryoslept("p5");
        gameController.doctorCheck("TEST1", Map.of("doctorId", "p2", "targetId", "p5"), h("s1"));
        assertRejected("p1", "DOCTOR_CHECK");
        assertActionNotDone("p2");
    }

    // ══════════════════════════════════════════════════════════════════════
    //                       P R O T E C T
    // ══════════════════════════════════════════════════════════════════════

    @Test
    void testProtectUnauthorizedSilent() {
        gameController.protect("TEST1", Map.of("targetId", "p1"), h("s99"));
        assertNoRejectionAnywhere();
        assertThat(room.getGameState().getProtectedPlayerId()).isBlank();
    }

    @Test
    void testProtectWrongRoleRejected() {
        gameController.protect("TEST1", Map.of("targetId", "p1"), h("s1"));
        assertRejected("p1", "PROTECT");
    }

    @Test
    void testProtectWrongPhaseRejected() {
        setPhase(Phase.VOTING);
        gameController.protect("TEST1", Map.of("targetId", "p1"), h("s3"));
        assertRejected("p3", "PROTECT");
    }

    @Test
    void testProtectDeadGaRejected() {
        makeDead("p3");
        gameController.protect("TEST1", Map.of("targetId", "p1"), h("s3"));
        assertRejected("p3", "PROTECT");
    }

    @Test
    void testProtectCryosleptGaRejected() {
        makeCryoslept("p3");
        gameController.protect("TEST1", Map.of("targetId", "p1"), h("s3"));
        assertRejected("p3", "PROTECT");
    }

    @Test
    void testProtectInvalidTargetRejected() {
        gameController.protect("TEST1", Map.of("targetId", "ghost"), h("s3"));
        assertRejected("p3", "PROTECT");
    }

    @Test
    void testProtectCrossRoomTargetRejected() {
        seedExternalRoom();
        gameController.protect("TEST1", Map.of("targetId", "ext-1"), h("s3"));
        assertRejected("p3", "PROTECT");
    }

    @Test
    void testProtectDeadTargetRejected() {
        makeDead("p1");
        gameController.protect("TEST1", Map.of("targetId", "p1"), h("s3"));
        assertRejected("p3", "PROTECT");
    }

    @Test
    void testProtectRepeatedActionRejected() {
        gameController.protect("TEST1", Map.of("targetId", "p1"), h("s3"));
        assertNotRejected("p3");
        assertActionDone("p3", "PROTECTED");

        gameController.protect("TEST1", Map.of("targetId", "p2"), h("s3"));
        assertRejected("p3", "PROTECT");
    }

    @Test
    void testProtectActorIdSpoofed() {
        gameController.protect("TEST1", Map.of("gaId", "p3", "targetId", "p1"), h("s1"));
        assertRejected("p1", "PROTECT");
        assertThat(room.getGameState().getProtectedPlayerId()).isBlank();
    }

    // ══════════════════════════════════════════════════════════════════════
    //                          K I L L
    // ══════════════════════════════════════════════════════════════════════

    @Test
    void testKillUnauthorizedSilent() {
        gameController.kill("TEST1", Map.of("targetId", "p1"), h("s99"));
        assertNoRejectionAnywhere();
    }

    @Test
    void testKillWrongRoleRejected() {
        gameController.kill("TEST1", Map.of("targetId", "p1"), h("s1"));
        assertRejected("p1", "KILL");
    }

    @Test
    void testKillWrongPhaseRejected() {
        setPhase(Phase.VOTING);
        gameController.kill("TEST1", Map.of("targetId", "p1"), h("s4"));
        assertRejected("p4", "KILL");
    }

    @Test
    void testKillDeadGnosiaRejected() {
        makeDead("p4");
        gameController.kill("TEST1", Map.of("targetId", "p1"), h("s4"));
        assertRejected("p4", "KILL");
    }

    @Test
    void testKillCryosleptGnosiaRejected() {
        makeCryoslept("p4");
        gameController.kill("TEST1", Map.of("targetId", "p1"), h("s4"));
        assertRejected("p4", "KILL");
    }

    @Test
    void testKillInvalidTargetRejected() {
        gameController.kill("TEST1", Map.of("targetId", "ghost"), h("s4"));
        assertRejected("p4", "KILL");
    }

    @Test
    void testKillCrossRoomTargetRejected() {
        seedExternalRoom();
        gameController.kill("TEST1", Map.of("targetId", "ext-1"), h("s4"));
        assertRejected("p4", "KILL");
    }

    @Test
    void testKillTargetIsGnosiaRejected() {
        // With 1 Gnosia, self-kill attempt is role-mismatch (target.role == GNOSIA)
        gameController.kill("TEST1", Map.of("targetId", "p4"), h("s4"));
        assertRejected("p4", "KILL");
        assertThat(room.getGameState().getGnosiaVotes()).isEmpty();
    }

    @Test
    void testKillDeadTargetRejected() {
        makeDead("p5");
        gameController.kill("TEST1", Map.of("targetId", "p5"), h("s4"));
        assertRejected("p4", "KILL");
        assertThat(room.getGameState().getGnosiaVotes()).isEmpty();
    }

    @Test
    void testKillRepeatedActionRejected() {
        gameController.kill("TEST1", Map.of("targetId", "p1"), h("s4"));
        assertNotRejected("p4");
        assertActionDone("p4", "KILL_VOTE_CAST");

        gameController.kill("TEST1", Map.of("targetId", "p2"), h("s4"));
        assertRejected("p4", "KILL");
    }

    @Test
    void testKillActorIdSpoofed() {
        gameController.kill("TEST1", Map.of("voterId", "p4", "targetId", "p1"), h("s1"));
        assertRejected("p1", "KILL");
        assertThat(room.getGameState().getGnosiaVotes()).isEmpty();
        assertActionNotDone("p4");
    }
}
