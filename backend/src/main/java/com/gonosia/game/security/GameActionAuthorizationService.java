package com.gonosia.game.security;

import com.gonosia.game.model.GameConfig;
import com.gonosia.game.model.Phase;
import com.gonosia.game.model.Player;
import com.gonosia.game.model.Role;
import com.gonosia.game.model.Room;
import org.springframework.stereotype.Service;

/**
 * Canonical authorization + business validation for every game action.
 *
 * The client is never trusted for identity, room membership, phase, vitality,
 * role, target validity or already-used state. Controllers only resolve the
 * authenticated session into an actor, then delegate every check to this service
 * before executing the action. A denied action surfaces as an
 * {@link ActionDeniedException} that the caller turns into an ACTION_REJECTED frame.
 *
 * Gate order (every action):
 *   authenticated player & room membership   (SessionIdentityService, before this service)
 *   game exists                             (controller room lookup, before this service)
 *   correct phase
 *   player alive
 *   player not cryoslept
 *   correct role
 *   valid target (exists in the same room; alive/state where required)
 *   action state not already used
 *   execute
 */
@Service
public class GameActionAuthorizationService {

    // ─── START ────────────────────────────────────────────────────────────
    // Only the host may depart. Departure is allowed when the vessel is full
    // (existing behaviour) OR when the minimum crew has boarded and every
    // connected crew member has signalled ready. A started game can never
    // return to the lobby.
    public Player requireCanStart(Room room, Player actor) {
        if (room.getGameState() == null || room.getGameState().getPhase() != Phase.LOBBY) {
            throw denied("START", "Game already started");
        }
        String hostId = room.getHostId();
        if (hostId != null && !hostId.equals(actor.getId())) {
            throw denied("START", "Only the host can depart");
        }
        GameConfig config = room.getConfig();
        int size = room.getPlayers().size();
        boolean atCapacity = size >= config.getMaxPlayers();
        if (atCapacity) {
            return actor;
        }
        if (size < config.getMinPlayers()) {
            throw denied("START", "Not enough crew to depart");
        }
        boolean allReady = room.getPlayers().stream()
                .filter(Player::isConnected)
                .allMatch(Player::isReady);
        if (!allReady) {
            throw denied("START", "Waiting for every crew member to signal ready");
        }
        return actor;
    }

    // ─── VOTE ─────────────────────────────────────────────────────────────
    // Every living member (any role) may vote during VOTING. A player may change
    // their vote until voting closes, so re-submission is allowed and simply
    // overwrites the previous ballot. Targets must exist in the room and be alive.
    public Player requireCanVote(Room room, Player actor, String targetId) {
        requirePhase(room, actor, "VOTE", Phase.VOTING, "Voting is not active right now");
        requireAlive(actor, "VOTE", "Dead crew members cannot vote");
        requireNotCryoslept(actor, "VOTE", "Cryoslept crew members cannot vote");
        Player target = requireTarget(room, "VOTE", targetId);
        if (!target.isAlive()) {
            throw denied("VOTE", "Cannot vote for a dead crew member");
        }
        return target;
    }

    // ─── SCAN (Engineer) ──────────────────────────────────────────────────
    public Player requireCanScan(Room room, Player actor, String targetId) {
        requirePhase(room, actor, "SCAN", Phase.WARP, "Engineer scan is only available during WARP");
        requireAlive(actor, "SCAN", "Dead crew members cannot scan");
        requireNotCryoslept(actor, "SCAN", "Cryoslept crew members cannot scan");
        requireRole(actor, "SCAN", Role.ENGINEER, "Only the Engineer can scan");
        requireActionAvailable(room, actor, "SCAN", "Engineer scan already used this warp round");
        return requireTarget(room, "SCAN", targetId);
    }

    // ─── DOCTOR CHECK ────────────────────────────────────────────────────
    public Player requireCanDoctorCheck(Room room, Player actor, String targetId) {
        requirePhase(room, actor, "DOCTOR_CHECK", Phase.WARP, "Doctor check is only available during WARP");
        requireAlive(actor, "DOCTOR_CHECK", "Dead crew members cannot perform a check");
        requireNotCryoslept(actor, "DOCTOR_CHECK", "Cryoslept crew members cannot perform a check");
        requireRole(actor, "DOCTOR_CHECK", Role.DOCTOR, "Only the Doctor can perform a check");
        requireActionAvailable(room, actor, "DOCTOR_CHECK", "Doctor check already used this warp round");
        Player target = requireTarget(room, "DOCTOR_CHECK", targetId);
        if (!target.isCryoslept()) {
            throw denied("DOCTOR_CHECK", "You can only check cryoslept crew members");
        }
        return target;
    }

    // ─── PROTECT (Guardian Angel) ─────────────────────────────────────────
    public Player requireCanProtect(Room room, Player actor, String targetId) {
        requirePhase(room, actor, "PROTECT", Phase.WARP, "Guardian Angel protect is only available during WARP");
        requireAlive(actor, "PROTECT", "Dead crew members cannot protect");
        requireNotCryoslept(actor, "PROTECT", "Cryoslept crew members cannot protect");
        requireRole(actor, "PROTECT", Role.GUARDIAN_ANGEL, "Only the Guardian Angel can protect");
        requireActionAvailable(room, actor, "PROTECT", "Guardian Angel protect already used this warp round");
        Player target = requireTarget(room, "PROTECT", targetId);
        if (!target.isAlive()) {
            throw denied("PROTECT", "Cannot protect a dead crew member");
        }
        return target;
    }

    // ─── KILL (Gnosia WARP vote) ──────────────────────────────────────────
    public Player requireCanKill(Room room, Player actor, String targetId) {
        requirePhase(room, actor, "KILL", Phase.WARP, "Kill vote is only available during WARP");
        requireAlive(actor, "KILL", "Dead Gnosia cannot vote to kill");
        requireNotCryoslept(actor, "KILL", "Cryoslept Gnosia cannot vote to kill");
        requireRole(actor, "KILL", Role.GNOSIA, "Only Gnosia can vote to kill");
        requireActionAvailable(room, actor, "KILL", "Kill vote already used this warp round");
        Player target = requireTarget(room, "KILL", targetId);
        if (!target.isAlive() || target.getRole() == Role.GNOSIA) {
            throw denied("KILL", "Invalid target — must be an alive human crew member");
        }
        return target;
    }

    // ─── Shared gates ─────────────────────────────────────────────────────

    private void requirePhase(Room room, Player actor, String action, Phase required, String reason) {
        if (room.getGameState() == null || room.getGameState().getPhase() != required) {
            throw denied(action, reason);
        }
    }

    private void requireAlive(Player actor, String action, String reason) {
        if (!actor.isAlive()) {
            throw denied(action, reason);
        }
    }

    private void requireNotCryoslept(Player actor, String action, String reason) {
        if (actor.isCryoslept()) {
            throw denied(action, reason);
        }
    }

    private void requireRole(Player actor, String action, Role required, String reason) {
        if (actor.getRole() != required) {
            throw denied(action, reason);
        }
    }

    private void requireActionAvailable(Room room, Player actor, String action, String reason) {
        if (room.getGameState() != null
                && room.getGameState().getPlayerActionDone() != null
                && room.getGameState().getPlayerActionDone().containsKey(actor.getId())) {
            throw denied(action, reason);
        }
    }

    // Targets resolve inside the room only, so a foreign playerId can never be
    // a valid target — it will simply not be found here.
    private Player requireTarget(Room room, String action, String targetId) {
        Player target = room.getPlayer(targetId);
        if (target == null) {
            throw denied(action, "Target player not found");
        }
        return target;
    }

    private ActionDeniedException denied(String action, String reason) {
        return new ActionDeniedException(action, reason);
    }
}