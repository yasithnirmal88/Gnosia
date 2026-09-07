package com.gonosia.game.controller;

import com.gonosia.game.model.*;
import com.gonosia.game.security.SessionIdentityService;
import com.gonosia.game.service.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.*;

@Controller
public class GameController {
    private static final Logger log = LoggerFactory.getLogger(GameController.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final RoomManager roomManager;
    private final GameService gameService;
    private final SessionIdentityService identityService;

    public GameController(SimpMessagingTemplate messagingTemplate, RoomManager roomManager, GameService gameService,
            SessionIdentityService identityService) {
        this.messagingTemplate = messagingTemplate;
        this.roomManager = roomManager;
        this.gameService = gameService;
        this.identityService = identityService;
    }

    private final String[] GNOSIA_CHARACTERS = {
        "Setsu", "Jina", "SQ", "Raqio", "Stella",
        "Shigemichi", "Chipie", "Comet", "Jonas",
        "Kukurushka", "Otome", "Sha-ming", "Remnan",
        "Yuriko", "Yuri"
    };
    private final Random random = new Random();

    private SessionIdentityService.Actor requireRoomMembership(SimpMessageHeaderAccessor headerAccessor, String roomCode, Room room) {
        String sessionId = headerAccessor != null ? headerAccessor.getSessionId() : null;
        return identityService.requireRoomMembership(sessionId, room);
    }

    private void reject(SessionIdentityService.Actor actor, String action, String reason) {
        if (actor == null) return;
        log.warn("[REJECTED] {} by {}: {}", action, actor.player().getName(), reason);
        messagingTemplate.convertAndSend(actor.privateTopic(),
            Map.of("type", "ACTION_REJECTED", "action", action, "reason", reason));
    }

    private void roomError(String channelKey, String message) {
        messagingTemplate.convertAndSend("/topic/private/" + channelKey,
            Map.of("type", "JOIN_ERROR", "message", message));
    }

    private String messageForClaim(SessionIdentityService.ClaimResult claim) {
        switch (claim) {
            case INVALID_KEY: return "Invalid identity key";
            case INVALID_PLAYER_ID: return "Invalid player id";
            case SESSION_ALREADY_BOUND: return "This connection is already bound to another identity";
            case WRONG_KEY: return "Identity key mismatch";
            case ALREADY_ACTIVE_ELSEWHERE: return "This identity is already active in another session";
            case ALREADY_BOUND_TO_ROOM: return "This identity already belongs to another room";
            default: return "Join failed";
        }
    }

    @MessageMapping("/room/create")
    public void createRoom(@Payload RoomCreateRequest request, SimpMessageHeaderAccessor headerAccessor) {
        String channelKey = request.getChannelKey();
        String playerId = request.getPlayerId();

        if (!SessionIdentityService.isValidChannelKey(channelKey) || !SessionIdentityService.isValidPlayerId(playerId)) {
            log.warn("[REJECTED] ROOM_CREATE with invalid identity from session {}",
                    headerAccessor != null ? headerAccessor.getSessionId() : null);
            if (SessionIdentityService.isValidChannelKey(channelKey)) {
                roomError(channelKey, "Invalid identity");
            }
            return;
        }

        String code = request.getRoomCode() != null ? request.getRoomCode().trim().toUpperCase() : null;
        if (code != null && !SessionIdentityService.isValidRoomCode(code)) {
            roomError(channelKey, "Invalid room code");
            return;
        }
        if (code != null && roomManager.getRoom(code) != null) {
            roomError(channelKey, "Room code already exists");
            return;
        }

        if (!SessionIdentityService.isValidPin(request.getPin())) {
            roomError(channelKey, "Invalid PIN");
            return;
        }

        String sessionId = headerAccessor != null ? headerAccessor.getSessionId() : null;

        Room room = roomManager.createRoom(code, request.getParticipants(), request.getPin());
        String finalRoomCode = room.getRoomCode();
        SessionIdentityService.ClaimResult claim = identityService.claim(sessionId, playerId, channelKey, finalRoomCode);
        if (claim != SessionIdentityService.ClaimResult.OK) {
            roomManager.removeRoom(finalRoomCode);
            roomError(channelKey, messageForClaim(claim));
            return;
        }
        Player player = new Player();
        player.setId(playerId);
        String randomName = GNOSIA_CHARACTERS[random.nextInt(GNOSIA_CHARACTERS.length)];
        player.setName(randomName);
        player.setAvatar("/images/" + randomName + ".png");
        player.setConnected(true);
        player.setAlive(true);
        room.addPlayer(player);

        messagingTemplate.convertAndSend("/topic/private/" + channelKey,
            Map.of("type", "ROOM_CREATED", "roomCode", room.getRoomCode(), "playerId", playerId));

        gameService.broadcastState(room);
        log.info("Room created by: " + playerId + " with code: " + room.getRoomCode());
    }

    @MessageMapping("/room/{roomCode}/join")
    public void joinRoom(@DestinationVariable("roomCode") String roomCode, @Payload RoomJoinRequest joinRequest,
            SimpMessageHeaderAccessor headerAccessor) {
        String channelKey = joinRequest.getChannelKey();
        String playerId = joinRequest.getId();

        if (!SessionIdentityService.isValidChannelKey(channelKey) || !SessionIdentityService.isValidPlayerId(playerId)) {
            log.warn("[REJECTED] JOIN with invalid identity for {}", roomCode);
            if (SessionIdentityService.isValidChannelKey(channelKey)) {
                roomError(channelKey, "Invalid identity");
            }
            return;
        }

        String normalizedCode = roomCode == null ? null : roomCode.trim().toUpperCase();
        if (normalizedCode != null && !SessionIdentityService.isValidRoomCode(normalizedCode)) {
            roomError(channelKey, "Vessel not found — check your code");
            return;
        }

        Room room = roomManager.getRoom(normalizedCode);
        if (room == null) {
            roomError(channelKey, "Vessel not found — check your code");
            return;
        }

        String pin = joinRequest.getPin();
        if (!SessionIdentityService.isValidPin(pin) || room.getPin() == null || !room.getPin().equals(pin)) {
            roomError(channelKey, "Incorrect PIN");
            return;
        }

        Player existing = room.getPlayer(playerId);
        if (existing == null && room.getGameState().getPhase() != Phase.LOBBY) {
            roomError(channelKey, "Game already started");
            return;
        }

        if (existing == null && room.getPlayers().size() >= room.getConfig().getMaxPlayers()) {
            roomError(channelKey, "Vessel at max capacity");
            return;
        }

        String sessionId = headerAccessor != null ? headerAccessor.getSessionId() : null;
        SessionIdentityService.ClaimResult claim = identityService.claim(sessionId, playerId, channelKey, normalizedCode);
        if (claim != SessionIdentityService.ClaimResult.OK) {
            roomError(channelKey, messageForClaim(claim));
            return;
        }

        if (existing != null) {
            existing.setConnected(true);
            log.info("Player ID " + existing.getId() + " joined/reconnected to " + normalizedCode);
        } else {
            List<String> availableNames = new java.util.ArrayList<>(java.util.Arrays.asList(GNOSIA_CHARACTERS));
            room.getPlayers().forEach(p -> availableNames.remove(p.getName()));
            if (availableNames.isEmpty()) {
                availableNames.add("UnknownVessel" + random.nextInt(1000));
            }
            String randomName = availableNames.get(random.nextInt(availableNames.size()));
            String randomAvatar = "/images/" + randomName + ".png";

            Player player = new Player();
            player.setId(playerId);
            player.setName(randomName);
            player.setAvatar(randomAvatar);
            player.setConnected(true);
            player.setAlive(true);
            room.addPlayer(player);
            log.info("Assigned identity " + randomName + " joined " + normalizedCode);
        }

        messagingTemplate.convertAndSend("/topic/private/" + channelKey,
            Map.of("type", "JOIN_CONFIRMED", "roomCode", normalizedCode, "playerId", playerId));

        gameService.broadcastState(room);
    }

    @MessageMapping("/room/{roomCode}/start")
    public void startGame(@DestinationVariable("roomCode") String roomCode, SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        if (actor == null) return;

        if (room.getGameState().getPhase() == Phase.LOBBY) {
            if (room.getPlayers().size() >= room.getConfig().getMaxPlayers()) {
                gameService.transitionPhase(room);
            }
        }
    }

    @MessageMapping("/room/{roomCode}/vote")
    public void vote(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        Player voter = actor != null ? actor.player() : null;
        if (voter == null) return;

        if (room.getGameState().getPhase() != Phase.VOTING) {
            reject(actor, "VOTE", "Voting is not active right now");
            return;
        }

        if (!voter.isAlive()) {
            reject(actor, "VOTE", "Dead crew members cannot vote");
            return;
        }

        if (voter.isCryoslept()) {
            reject(actor, "VOTE", "Cryoslept crew members cannot vote");
            return;
        }

        String targetId = payload.get("targetId");
        room.getGameState().getCurrentVotes().put(voter.getId(), targetId);
        room.getGameState().getPlayerActionDone().put(voter.getId(), "VOTED");
        log.info("[VOTE] {} voted for {}", voter.getName(), targetId);
        gameService.broadcastState(room);
    }

    @MessageMapping("/room/{roomCode}/scan")
    public void scan(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        Player scanner = actor != null ? actor.player() : null;
        if (scanner == null) return;

        if (room.getGameState().getPhase() != Phase.WARP) {
            reject(actor, "SCAN", "Engineer scan is only available during WARP");
            return;
        }

        if (!scanner.isAlive()) {
            reject(actor, "SCAN", "Dead crew members cannot scan");
            return;
        }

        if (scanner.isCryoslept()) {
            reject(actor, "SCAN", "Cryoslept crew members cannot scan");
            return;
        }

        if (scanner.getRole() != Role.ENGINEER) {
            reject(actor, "SCAN", "Only the Engineer can scan");
            return;
        }

        Player target = room.getPlayer(payload.get("targetId"));
        if (target == null) {
            reject(actor, "SCAN", "Target player not found");
            return;
        }

        log.info("[SCAN] Scanner={}, Target={}", scanner.getName(), target.getName());
        String result = target.getRole() == Role.GNOSIA ? "GNOSIA" : "HUMAN";
        messagingTemplate.convertAndSend(actor.privateTopic(),
            Map.of("type", "SCAN_RESULT", "targetId", target.getId(), "result", result));
        room.getGameState().getPlayerActionDone().put(scanner.getId(), "SCANNED");
        log.info("[SCAN] Result sent to {}: {}", scanner.getName(), result);
        gameService.broadcastState(room);
    }

    @MessageMapping("/room/{roomCode}/doctorCheck")
    public void doctorCheck(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        Player doctor = actor != null ? actor.player() : null;
        if (doctor == null) return;

        if (room.getGameState().getPhase() != Phase.WARP) {
            reject(actor, "DOCTOR_CHECK", "Doctor check is only available during WARP");
            return;
        }

        if (!doctor.isAlive()) {
            reject(actor, "DOCTOR_CHECK", "Dead crew members cannot perform a check");
            return;
        }

        if (doctor.isCryoslept()) {
            reject(actor, "DOCTOR_CHECK", "Cryoslept crew members cannot perform a check");
            return;
        }

        if (doctor.getRole() != Role.DOCTOR) {
            reject(actor, "DOCTOR_CHECK", "Only the Doctor can perform a check");
            return;
        }

        String targetId = payload.get("targetId");
        Player target = room.getPlayer(targetId);

        if (target == null) {
            reject(actor, "DOCTOR_CHECK", "Target player not found");
            return;
        }

        if (!target.isCryoslept()) {
            reject(actor, "DOCTOR_CHECK", "You can only check cryoslept crew members");
            return;
        }

        log.info("[DOCTOR] Doctor={}, Target={}, TargetCryoslept={}", doctor.getName(), target.getName(), target.isCryoslept());
        String result = target.getRole() == Role.GNOSIA ? "GNOSIA" : "HUMAN";
        messagingTemplate.convertAndSend(actor.privateTopic(),
            Map.of("type", "DOCTOR_CHECK_RESULT", "targetId", target.getId(), "result", result));
        room.getGameState().getPlayerActionDone().put(doctor.getId(), "DOCTOR_CHECKED");
        log.info("[DOCTOR] Result sent to {}: {}", doctor.getName(), result);
        gameService.broadcastState(room);
    }

    @MessageMapping("/room/{roomCode}/protect")
    public void protect(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        Player ga = actor != null ? actor.player() : null;
        if (ga == null) return;

        if (room.getGameState().getPhase() != Phase.WARP) {
            reject(actor, "PROTECT", "Guardian Angel protect is only available during WARP");
            return;
        }

        if (!ga.isAlive()) {
            reject(actor, "PROTECT", "Dead crew members cannot protect");
            return;
        }

        if (ga.isCryoslept()) {
            reject(actor, "PROTECT", "Cryoslept crew members cannot protect");
            return;
        }

        if (ga.getRole() != Role.GUARDIAN_ANGEL) {
            reject(actor, "PROTECT", "Only the Guardian Angel can protect");
            return;
        }

        Player target = room.getPlayer(payload.get("targetId"));
        if (target == null) {
            reject(actor, "PROTECT", "Target player not found");
            return;
        }

        log.info("[PROTECT] {} shielded: {}", ga.getName(), target.getName());
        room.getGameState().setProtectedPlayerId(target.getId());
        room.getGameState().getPlayerActionDone().put(ga.getId(), "PROTECTED");
        gameService.broadcastState(room);
    }

    @MessageMapping("/room/{roomCode}/kill")
    public void kill(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        Player gnosia = actor != null ? actor.player() : null;
        if (gnosia == null) return;

        if (room.getGameState().getPhase() != Phase.WARP) {
            reject(actor, "KILL", "Kill vote is only available during WARP");
            return;
        }

        if (!gnosia.isAlive()) {
            reject(actor, "KILL", "Dead Gnosia cannot vote to kill");
            return;
        }

        if (gnosia.isCryoslept()) {
            reject(actor, "KILL", "Cryoslept Gnosia cannot vote to kill");
            return;
        }

        if (gnosia.getRole() != Role.GNOSIA) {
            reject(actor, "KILL", "Only Gnosia can vote to kill");
            return;
        }

        String targetId = payload.get("targetId");
        Player target = room.getPlayer(targetId);
        if (target == null || !target.isAlive() || target.getRole() == Role.GNOSIA) {
            reject(actor, "KILL", "Invalid target — must be an alive human crew member");
            return;
        }

        GameState state = room.getGameState();
        state.getGnosiaVotes().put(gnosia.getId(), targetId);
        state.getPlayerActionDone().put(gnosia.getId(), "KILL_VOTE_CAST");
        log.info("[WARP] {} voted to kill: {}", gnosia.getName(), target.getName());

        Map<String, String> allVotes = state.getGnosiaVotes();
        StringBuilder voteDetail = new StringBuilder("[WARP] All Gnosia votes: ");
        allVotes.forEach((gid, tid) -> {
            Player gp = room.getPlayer(gid);
            Player tp = room.getPlayer(tid);
            voteDetail.append((gp != null ? gp.getName() : gid))
                      .append("->")
                      .append((tp != null ? tp.getName() : tid))
                      .append(" ");
        });
        log.info(voteDetail.toString());

        List<Player> aliveGnosia = room.getPlayers().stream()
                .filter(p -> p.isAlive() && p.getRole() == Role.GNOSIA)
                .collect(java.util.stream.Collectors.toList());

        long agreeCount = aliveGnosia.stream()
                .filter(g -> targetId.equals(state.getGnosiaVotes().get(g.getId())))
                .count();

        if (agreeCount * 2 > aliveGnosia.size()) {
            state.setGnosiaTargetPlayerId(targetId);
            log.info("[WARP] CONSENSUS reached. {}/{} Gnosia selected: {}", agreeCount, aliveGnosia.size(), target.getName());
            messagingTemplate.convertAndSend("/topic/room/" + room.getRoomCode() + "/events",
                Map.of("type", "GNOSIA_CONSENSUS", "targetId", targetId, "targetName", target.getName()));
        } else {
            log.info("[WARP] {}/{} Gnosia voted for {}. Consensus threshold {}/{} not met.",
                     agreeCount, aliveGnosia.size(), target.getName(),
                     aliveGnosia.size() / 2 + 1, aliveGnosia.size());
        }

        gameService.broadcastState(room);
    }

    @MessageMapping("/room/{roomCode}/signal")
    public void handleSignal(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, Object> payload,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        if (actor == null) return;

        String targetId = (String) payload.get("targetId");
        Player target = room.getPlayer(targetId);
        if (target == null) return;

        Map<String, Object> signal = new HashMap<>(payload);
        signal.put("fromId", actor.player().getId());
        signal.put("type", "SIGNAL");
        String targetTopic = identityService.privateTopicForPlayer(targetId);
        if (targetTopic != null) {
            messagingTemplate.convertAndSend(targetTopic, signal);
        }
    }
}