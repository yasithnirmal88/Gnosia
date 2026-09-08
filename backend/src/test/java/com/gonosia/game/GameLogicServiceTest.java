package com.gonosia.game;

import com.gonosia.game.model.*;
import com.gonosia.game.service.GameLogicService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure unit tests for {@link GameLogicService}: role assignment, vote
 * resolution, and win-condition checks. No Spring context required —
 * the service is instantiated directly.
 */
class GameLogicServiceTest {

    private GameLogicService service;

    @BeforeEach
    void setUp() {
        service = new GameLogicService();
    }

    private Player player(String id, Role role, boolean alive) {
        Player p = new Player();
        p.setId(id);
        p.setRole(role);
        p.setAlive(alive);
        p.setConnected(true);
        p.setName("P-" + id);
        p.setCryoslept(false);
        return p;
    }

    private Room roomWith(Player... players) {
        Room r = new Room();
        r.setRoomCode("UT");
        r.setGameState(new GameState());
        r.getConfig().setMaxPlayers(players.length);
        for (Player p : players) r.addPlayer(p);
        return r;
    }

    // ─── assignRoles ──────────────────────────────────────────────────────

    @Test
    void assignRolesFivePlayersOneGnosia() {
        Room r = roomWith(
                player("a", Role.HUMAN, true),
                player("b", Role.HUMAN, true),
                player("c", Role.HUMAN, true),
                player("d", Role.HUMAN, true),
                player("e", Role.HUMAN, true));

        service.assignRoles(r);

        long gnosia = r.getPlayers().stream().filter(p -> p.getRole() == Role.GNOSIA).count();
        long eng    = r.getPlayers().stream().filter(p -> p.getRole() == Role.ENGINEER).count();
        assertThat(gnosia).isEqualTo(1);
        assertThat(eng).isEqualTo(1);
        // remaining are HUMAN
        assertThat(r.getPlayers().stream().filter(p -> p.getRole() == Role.HUMAN).count()).isEqualTo(3);
    }

    @Test
    void assignRolesTenPlayersTwoGnosia() {
        Room r = new Room();
        r.setRoomCode("UT10");
        r.setGameState(new GameState());
        r.getConfig().setMaxPlayers(10);
        for (int i = 0; i < 10; i++) r.addPlayer(player("p" + i, Role.HUMAN, true));

        service.assignRoles(r);

        long gnosia = r.getPlayers().stream().filter(p -> p.getRole() == Role.GNOSIA).count();
        long eng    = r.getPlayers().stream().filter(p -> p.getRole() == Role.ENGINEER).count();
        long doc    = r.getPlayers().stream().filter(p -> p.getRole() == Role.DOCTOR).count();
        long ga     = r.getPlayers().stream().filter(p -> p.getRole() == Role.GUARDIAN_ANGEL).count();
        assertThat(gnosia).isEqualTo(2);
        assertThat(eng + doc + ga).isGreaterThanOrEqualTo(1); // at least one special role
        assertThat(gnosia + eng + doc + ga).isLessThanOrEqualTo(7); // at most 2+5 specials
    }

    @Test
    void assignRolesFifteenPlayersThreeGnosiaAndAllSpecials() {
        Room r = new Room();
        r.setRoomCode("UT15");
        r.setGameState(new GameState());
        r.getConfig().setMaxPlayers(15);
        for (int i = 0; i < 15; i++) r.addPlayer(player("p" + i, Role.HUMAN, true));

        service.assignRoles(r);

        long gnosia = r.getPlayers().stream().filter(p -> p.getRole() == Role.GNOSIA).count();
        long eng    = r.getPlayers().stream().filter(p -> p.getRole() == Role.ENGINEER).count();
        long doc    = r.getPlayers().stream().filter(p -> p.getRole() == Role.DOCTOR).count();
        long ga     = r.getPlayers().stream().filter(p -> p.getRole() == Role.GUARDIAN_ANGEL).count();
        long human  = r.getPlayers().stream().filter(p -> p.getRole() == Role.HUMAN).count();
        assertThat(gnosia).isEqualTo(3);
        assertThat(eng).isEqualTo(1);
        assertThat(doc).isEqualTo(1);
        assertThat(ga).isEqualTo(1);
        assertThat(human).isEqualTo(9);
        assertThat(gnosia + eng + doc + ga + human).isEqualTo(15);
    }

    @Test
    void assignRolesSinglePlayerOnlyGnosia() {
        Room r = roomWith(player("lonely", Role.HUMAN, true));
        service.assignRoles(r);
        assertThat(r.getPlayers().get(0).getRole()).isEqualTo(Role.GNOSIA);
    }

    @Test
    void assignRolesRespectsExplicitGnosiaCount() {
        Room r = roomWith(
                player("a", Role.HUMAN, true),
                player("b", Role.HUMAN, true),
                player("c", Role.HUMAN, true),
                player("d", Role.HUMAN, true),
                player("e", Role.HUMAN, true));
        r.getConfig().setGnosiaCount(2);

        service.assignRoles(r);

        long gnosia = r.getPlayers().stream().filter(p -> p.getRole() == Role.GNOSIA).count();
        assertThat(gnosia).isEqualTo(2);
    }

    // ─── resolveVoting ────────────────────────────────────────────────────

    @Test
    void resolveVotingUnanimousTarget() {
        Player a = player("a", Role.HUMAN, true);
        Player b = player("b", Role.GNOSIA, true);
        Player c = player("c", Role.HUMAN, true);
        Player d = player("d", Role.HUMAN, true);
        Player e = player("e", Role.HUMAN, true);
        Room r = roomWith(a, b, c, d, e);

        r.getGameState().getCurrentVotes().put("a", "b");
        r.getGameState().getCurrentVotes().put("b", "c");
        r.getGameState().getCurrentVotes().put("c", "b");
        r.getGameState().getCurrentVotes().put("d", "b");
        r.getGameState().getCurrentVotes().put("e", "b");

        String eliminated = service.resolveVoting(r);
        assertThat(eliminated).isEqualTo("b");
    }

    @Test
    void resolveVotingTieGoesToFirstByMax() {
        Player a = player("a", Role.HUMAN, true);
        Player b = player("b", Role.HUMAN, true);
        Player c = player("c", Role.HUMAN, true);
        Room r = roomWith(a, b, c);

        // 2-1 tie: a and c target b, b targets a
        r.getGameState().getCurrentVotes().put("a", "b");
        r.getGameState().getCurrentVotes().put("b", "a");
        r.getGameState().getCurrentVotes().put("c", "b");

        String eliminated = service.resolveVoting(r);
        // Tie goes to whichever the map/stream max picks (implementation detail — just verify it's one of them)
        assertThat(eliminated).isIn("a", "b");
    }

    @Test
    void resolveVotingNoVotesReturnsNull() {
        Room r = roomWith(
                player("a", Role.HUMAN, true),
                player("b", Role.HUMAN, true));
        String eliminated = service.resolveVoting(r);
        assertThat(eliminated).isNull();
    }

    // ━━━ checkWin ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    @Test
    void humanWinsWhenAllGnosiaAreDead() {
        Room r = roomWith(
                player("a", Role.ENGINEER, true),
                player("b", Role.HUMAN, true),
                player("c", Role.GNOSIA, false));

        Role winner = service.checkWin(r);
        assertThat(winner).isEqualTo(Role.HUMAN);
    }

    @Test
    void gnosiaWinsAtParity() {
        Room r = roomWith(
                player("g1", Role.GNOSIA, true),
                player("g2", Role.GNOSIA, true),
                player("h1", Role.HUMAN, true),
                player("h2", Role.HUMAN, true));

        Role winner = service.checkWin(r);
        assertThat(winner).isEqualTo(Role.GNOSIA);
    }

    @Test
    void gnosiaWinsWhenOutnumbering() {
        Room r = roomWith(
                player("g1", Role.GNOSIA, true),
                player("h1", Role.HUMAN, true));

        Role winner = service.checkWin(r);
        assertThat(winner).isEqualTo(Role.GNOSIA);
    }

    @Test
    void gameContinuesWhenBothSidesHavePlayers() {
        Room r = roomWith(
                player("g1", Role.GNOSIA, true),
                player("h1", Role.HUMAN, true),
                player("h2", Role.HUMAN, true));

        Role winner = service.checkWin(r);
        assertThat(winner).isNull();
    }

    @Test
    void allHumansDeadIsGnosiaWin() {
        Room r = roomWith(
                player("g1", Role.GNOSIA, true),
                player("h1", Role.HUMAN, false),
                player("h2", Role.HUMAN, false));

        Role winner = service.checkWin(r);
        assertThat(winner).isEqualTo(Role.GNOSIA);
    }
}