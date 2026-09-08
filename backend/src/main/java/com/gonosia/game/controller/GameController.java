package com.gonosia.game.controller;

import com.gonosia.game.model.*;
import com.gonosia.game.security.ActionDeniedException;
import com.gonosia.game.security.GameActionAuthorizationService;
import com.gonosia.game.security.RateLimitService;
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
import java.util.function.Supplier;

@Controller
public class GameController {
    private static final Logger log = LoggerFactory.getLogger(GameController.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final RoomManager roomManager;
    private final GameService gameService;
    private final SessionIdentityService identityService;
    private final GameActionAuthorizationService gameActionAuthorizationService;
    private final RateLimitService rateLimitService;

    public GameController(SimpMessagingTemplate messagingTemplate, RoomManager roomManager, GameService gameService,
            SessionIdentityService identityService, GameActionAuthorizationService gameActionAuthorizationService,
            RateLimitService rateLimitService) {
        this.messagingTemplate = messagingTemplate;
        this.roomManager = roomManager;
        this.gameService = gameService;
        this.identityService = identityService;
        this.gameActionAuthorizationService = gameActionAuthorizationService;
        this.rateLimitService = rateLimitService;
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

    private String sessionIdOf(SimpMessageHeaderAccessor headerAccessor) {
        return headerAccessor != null ? headerAccessor.getSessionId() : null;
    }

    /** Rate gate for game actions; returns false (and drops) when the flood guard trips. */
    private boolean rateLimitsAllow(SessionIdentityService.Actor actor, String roomCode,
            SimpMessageHeaderAccessor headerAccessor) {
        return rateLimitService.allowGameAction(sessionIdOf(headerAccessor), actor.player().getId(), roomCode);
    }

    private void reject(SessionIdentityService.Actor actor, String action, String reason) {
        if (actor == null) return;
        log.warn("[REJECTED] {} by {}: {}", action, actor.player().getName(), reason);
        messagingTemplate.convertAndSend(actor.privateTopic(),
            Map.of("type", "ACTION_REJECTED", "action", action, "reason", reason));
    }

    /** Run one of the authorization gates; on denial, emit ACTION_REJECTED and return null. */
    private Player resolveOrReject(SessionIdentityService.Actor actor, Supplier<Player> resolver) {
        try {
            return resolver.get();
        } catch (ActionDeniedException e) {
            reject(actor, e.getAction(), e.getReason());
            return null;
        }
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

        if (!rateLimitService.allowRoomCreation(sessionId)) {
            log.warn("[ROOM_CREATE] rate limit hit for session {}", sessionId);
            return;
        }

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
        if (!rateLimitService.allowJoin(sessionId)) {
            log.warn("[JOIN] {} rate limit hit for session {}", normalizedCode, sessionId);
            return;
        }
        SessionIdentityService.ClaimResult claim = identityService.claim(sessionId, playerId, channelKey, normalizedCode);
        if (claim != SessionIdentityService.ClaimResult.OK) {
            roomError(channelKey, messageForClaim(claim));
            return;
        }

        // Any successful join/reconnect proves the room is alive: it clears the
        // abandoned-room window ({@link RoomManager#markAllDisconnected}) so the
        // cleanup sweep keeps the room for legitimate reconnects.
        roomManager.touch(room);

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

        Player starter = resolveOrReject(actor,
                () -> gameActionAuthorizationService.requireCanStart(room, actor.player()));
        if (starter == null) return;
        if (!rateLimitsAllow(actor, roomCode, headerAccessor)) {
            log.warn("[START] {} rate limited", starter.getId());
            return;
        }

        gameService.transitionPhase(room);
    }

    @MessageMapping("/room/{roomCode}/vote")
    public void vote(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        if (actor == null) return;

        Player voter = actor.player();
        Player target = resolveOrReject(actor,
                () -> gameActionAuthorizationService.requireCanVote(room, voter, payload.get("targetId")));
        if (target == null) return;
        if (!rateLimitsAllow(actor, roomCode, headerAccessor)) {
            log.warn("[VOTE] {} rate limited", voter.getId());
            return;
        }

        // The vote handler runs on one thread per inbound connection, so concurrent
        // ballots must be recorded atomically — the backing map is not thread-safe.
        synchronized (room.getGameState()) {
            room.getGameState().getCurrentVotes().put(voter.getId(), target.getId());
            room.getGameState().getPlayerActionDone().put(voter.getId(), "VOTED");
        }
        log.info("[VOTE] {} voted for {}", voter.getName(), target.getName());
        gameService.broadcastState(room);
    }

    @MessageMapping("/room/{roomCode}/scan")
    public void scan(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        if (actor == null) return;

        Player scanner = actor.player();
        Player target = resolveOrReject(actor,
                () -> gameActionAuthorizationService.requireCanScan(room, scanner, payload.get("targetId")));
        if (target == null) return;
        if (!rateLimitsAllow(actor, roomCode, headerAccessor)) {
            log.warn("[SCAN] {} rate limited", scanner.getId());
            return;
        }

        log.info("[SCAN] Scanner={}, Target={}", scanner.getName(), target.getName());
        String result = target.getRole() == Role.GNOSIA ? "GNOSIA" : "HUMAN";
        messagingTemplate.convertAndSend(actor.privateTopic(),
            Map.of("type", "SCAN_RESULT", "targetId", target.getId(), "result", result));
        room.getGameState().getPlayerActionDone().put(scanner.getId(), "SCANNED");
        log.info("[SCAN] Result delivered to {}", scanner.getName());
        gameService.broadcastState(room);
    }

    @MessageMapping("/room/{roomCode}/doctorCheck")
    public void doctorCheck(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        if (actor == null) return;

        Player doctor = actor.player();
        Player target = resolveOrReject(actor,
                () -> gameActionAuthorizationService.requireCanDoctorCheck(room, doctor, payload.get("targetId")));
        if (target == null) return;
        if (!rateLimitsAllow(actor, roomCode, headerAccessor)) {
            log.warn("[DOCTOR_CHECK] {} rate limited", doctor.getId());
            return;
        }

        log.info("[DOCTOR] Doctor={}, Target={}, TargetCryoslept={}", doctor.getName(), target.getName(), target.isCryoslept());
        String result = target.getRole() == Role.GNOSIA ? "GNOSIA" : "HUMAN";
        messagingTemplate.convertAndSend(actor.privateTopic(),
            Map.of("type", "DOCTOR_CHECK_RESULT", "targetId", target.getId(), "result", result));
        room.getGameState().getPlayerActionDone().put(doctor.getId(), "DOCTOR_CHECKED");
        log.info("[DOCTOR] Result delivered to {}", doctor.getName());
        gameService.broadcastState(room);
    }

    @MessageMapping("/room/{roomCode}/protect")
    public void protect(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        if (actor == null) return;

        Player ga = actor.player();
        Player target = resolveOrReject(actor,
                () -> gameActionAuthorizationService.requireCanProtect(room, ga, payload.get("targetId")));
        if (target == null) return;
        if (!rateLimitsAllow(actor, roomCode, headerAccessor)) {
            log.warn("[PROTECT] {} rate limited", ga.getId());
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
        if (actor == null) return;

        Player gnosia = actor.player();
        Player target = resolveOrReject(actor,
                () -> gameActionAuthorizationService.requireCanKill(room, gnosia, payload.get("targetId")));
        if (target == null) return;
        if (!rateLimitsAllow(actor, roomCode, headerAccessor)) {
            log.warn("[KILL] {} rate limited", gnosia.getId());
            return;
        }
        String targetId = target.getId();

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

        String sessionId = headerAccessor != null ? headerAccessor.getSessionId() : null;
        if (sessionId == null) return;

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        if (actor == null) return;

        // Prevent signaling spam from a single session/player/IP.
        if (!rateLimitService.allowSignal(sessionId, actor.player().getId())) {
            log.warn("[SIGNAL] rate limit hit for player {}", actor.player().getId());
            return;
        }

        Player sender = actor.player();
        if (!sender.isAlive() || sender.isCryoslept()) return;

        // Target must be a member of THIS room, alive, reachable, and not the sender.
        String targetId = (String) (payload != null ? payload.get("targetId") : null);
        if (targetId == null) return;
        Player target = room.getPlayer(targetId);
        if (target == null || target == sender
                || !target.isAlive() || !target.isConnected()) {
            return;
        }

        Map<String, Object> signal = new HashMap<>(payload);
        signal.put("fromId", sender.getId());
        signal.put("type", "SIGNAL");
        // Route only via the target's secret private topic; a spoofed targetId
        // that does not belong to this room simply never resolves to a topic.
        String targetTopic = identityService.privateTopicForPlayer(targetId);
        if (targetTopic != null) {
            messagingTemplate.convertAndSend(targetTopic, signal);
        }
    }
}