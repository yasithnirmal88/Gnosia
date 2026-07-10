package com.gonosia.game.controller;

import com.gonosia.game.model.*;
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

    public GameController(SimpMessagingTemplate messagingTemplate, RoomManager roomManager, GameService gameService) {
        this.messagingTemplate = messagingTemplate;
        this.roomManager = roomManager;
        this.gameService = gameService;
    }

    private final String[] GNOSIA_CHARACTERS = {
        "Setsu", "Jina", "SQ", "Raqio", "Stella", 
        "Shigemichi", "Chipie", "Comet", "Jonas", 
        "Kukurushka", "Otome", "Sha-ming", "Remnan", 
        "Yuriko", "Yuri"
    };
    private final Random random = new Random();

    @MessageMapping("/room/create")
    public void createRoom(@Payload RoomCreateRequest request) {
        Room room = roomManager.createRoom(request.getRoomCode(), request.getParticipants(), request.getPin());
        Player player = new Player();
        player.setId(request.getPlayerId());
        String randomName = GNOSIA_CHARACTERS[random.nextInt(GNOSIA_CHARACTERS.length)];
        player.setName(randomName);
        player.setAvatar("/images/" + randomName + ".png");
        player.setConnected(true);
        player.setAlive(true);
        room.addPlayer(player);
        
        // Notify the creator specifically of the room code
        messagingTemplate.convertAndSend("/topic/user/" + request.getPlayerId() + "/private", 
            Map.of("type", "ROOM_CREATED", "roomCode", room.getRoomCode()));
            
        gameService.broadcastState(room);
        log.info("Room created by: " + request.getPlayerId() + " with code: " + room.getRoomCode());
    }

    @MessageMapping("/room/{roomCode}/join")
    public void joinRoom(@DestinationVariable("roomCode") String roomCode, @Payload RoomJoinRequest joinRequest, SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) {
            messagingTemplate.convertAndSend("/topic/user/" + joinRequest.getId() + "/private", 
                Map.of("type", "JOIN_ERROR", "message", "Vessel not found — check your code"));
            return;
        }
        
        String sessionId = headerAccessor.getSessionId();
        Player existing = room.getPlayer(joinRequest.getId());
                
        if (existing != null) {
            existing.setConnected(true);
            room.getSessionIdToPlayerId().put(sessionId, existing.getId());
            log.info("Player ID " + existing.getId() + " joined/reconnected to " + roomCode);
        } else {
            // PIN Verification removed per user request
            if (room.getPlayers().size() >= room.getConfig().getMaxPlayers()) {
                messagingTemplate.convertAndSend("/topic/user/" + joinRequest.getId() + "/private", 
                    Map.of("type", "JOIN_ERROR", "message", "Vessel at max capacity"));
                return;
            }

            List<String> availableNames = new java.util.ArrayList<>(java.util.Arrays.asList(GNOSIA_CHARACTERS));
            room.getPlayers().forEach(p -> availableNames.remove(p.getName()));
            if (availableNames.isEmpty()) {
                availableNames.add("UnknownVessel" + random.nextInt(1000));
            }
            String randomName = availableNames.get(random.nextInt(availableNames.size()));
            String randomAvatar = "/images/" + randomName + ".png";
            
            Player player = new Player();
            player.setId(joinRequest.getId());
            player.setName(randomName);
            player.setAvatar(randomAvatar);
            player.setConnected(true);
            player.setAlive(true);
            room.addPlayer(player);
            room.getSessionIdToPlayerId().put(sessionId, player.getId());
            log.info("Assigned identity " + randomName + " joined " + roomCode);
        }
        
        gameService.broadcastState(room);

        // Removed auto-start here. Players must manually trigger /start when ready.
    }

    @MessageMapping("/room/{roomCode}/start")
    public void startGame(@DestinationVariable("roomCode") String roomCode) {
        Room room = roomManager.getRoom(roomCode);
        if (room != null && room.getGameState().getPhase() == Phase.LOBBY) {
            if (room.getPlayers().size() >= room.getConfig().getMaxPlayers()) {
                gameService.transitionPhase(room);
            }
        }
    }

    @MessageMapping("/room/{roomCode}/vote")
    public void vote(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload) {
        Room room = roomManager.getRoom(roomCode);
        if (room != null && room.getGameState().getPhase() == Phase.VOTING) {
            String voterId = payload.get("voterId");
            Player voter = room.getPlayer(voterId);
            if (voter != null && voter.isAlive()) {
                room.getGameState().getCurrentVotes().put(voterId, payload.get("targetId"));
                room.getGameState().getPlayerActionDone().put(voterId, "VOTED");
                gameService.broadcastState(room);
            }
        }
    }

    @MessageMapping("/room/{roomCode}/scan")
    public void scan(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload) {
        Room room = roomManager.getRoom(roomCode);
        log.info("[SCAN] Payload received for room {}: {}", roomCode, payload);
        if (room != null && (room.getGameState().getPhase() == Phase.ROLE_ACTIONS || room.getGameState().getPhase() == Phase.WARP)) {
            Player scanner = room.getPlayer(payload.get("scannerId"));
            Player target = room.getPlayer(payload.get("targetId"));
            log.info("[SCAN] Scanner={}, Target={}", (scanner != null ? scanner.getName() : "null"), (target != null ? target.getName() : "null"));
            if (scanner != null && scanner.isAlive() && target != null && scanner.getRole() == Role.ENGINEER) {
                String result = target.getRole() == Role.GNOSIA ? "GNOSIA" : "HUMAN";
                messagingTemplate.convertAndSend("/topic/user/" + scanner.getId() + "/private", 
                    Map.of("type", "SCAN_RESULT", "targetId", target.getId(), "result", result));
                room.getGameState().getPlayerActionDone().put(scanner.getId(), "SCANNED");
                log.info("[SCAN] Result sent to {}: {}", scanner.getName(), result);
            }
        } else {
            log.warn("[SCAN] Invalid phase or room null. Room: {}, Phase: {}", roomCode, room != null ? room.getGameState().getPhase() : "null");
        }
    }

    @MessageMapping("/room/{roomCode}/doctorCheck")
    public void doctorCheck(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload) {
        Room room = roomManager.getRoom(roomCode);
        log.info("[DOCTOR] Payload received for room {}: {}", roomCode, payload);
        if (room != null && (room.getGameState().getPhase() == Phase.WARP || room.getGameState().getPhase() == Phase.ROLE_ACTIONS)) {
            Player doctor = room.getPlayer(payload.get("doctorId"));
            String targetId = payload.get("targetId");
            Player target = room.getPlayer(targetId);
            log.info("[DOCTOR] Doctor={}, Target={}, TargetCryoslept={}", 
                (doctor != null ? doctor.getName() : "null"), 
                (target != null ? target.getName() : "null"),
                (target != null ? target.isCryoslept() : "N/A"));
            if (doctor != null && doctor.isAlive() && doctor.getRole() == Role.DOCTOR && target != null && target.isCryoslept()) {
                String result = target.getRole() == Role.GNOSIA ? "GNOSIA" : "HUMAN";
                messagingTemplate.convertAndSend("/topic/user/" + doctor.getId() + "/private", 
                    Map.of("type", "DOCTOR_CHECK_RESULT", "targetId", target.getId(), "result", result));
                room.getGameState().getPlayerActionDone().put(doctor.getId(), "DOCTOR_CHECKED");
                log.info("[DOCTOR] Result sent to {}: {}", doctor.getName(), result);
            }
        } else {
            log.warn("[DOCTOR] Invalid phase or room null. Room: {}, Phase: {}", roomCode, room != null ? room.getGameState().getPhase() : "null");
        }
    }

    @MessageMapping("/room/{roomCode}/protect")
    public void protect(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload) {
        Room room = roomManager.getRoom(roomCode);
        if (room != null && (room.getGameState().getPhase() == Phase.ROLE_ACTIONS || room.getGameState().getPhase() == Phase.WARP)) {
            Player ga = room.getPlayer(payload.get("gaId"));
            if (ga != null && ga.isAlive() && ga.getRole() == Role.GUARDIAN_ANGEL) {
                room.getGameState().setProtectedPlayerId(payload.get("targetId"));
                room.getGameState().getPlayerActionDone().put(ga.getId(), "PROTECTED");
            }
        }
    }

    @MessageMapping("/room/{roomCode}/kill")
    public void kill(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null || room.getGameState().getPhase() != Phase.WARP) return;

        Player gnosia = room.getPlayer(payload.get("voterId"));
        if (gnosia == null || !gnosia.isAlive() || gnosia.getRole() != Role.GNOSIA) return;

        String targetId = payload.get("targetId");
        Player target = room.getPlayer(targetId);

        if (target == null || !target.isAlive() || target.getRole() == Role.GNOSIA) {
            log.warn("[WARP] Invalid kill target '{}' by {}. Must be an alive non-Gnosia player.", targetId, gnosia.getName());
            return;
        }

        GameState state = room.getGameState();
        state.getGnosiaVotes().put(gnosia.getId(), targetId);
        state.getPlayerActionDone().put(gnosia.getId(), "KILL_VOTE_CAST");
        log.info("[WARP] {} voted to kill: {}", gnosia.getName(), target.getName());

        // Check for majority consensus among alive Gnosia
        List<Player> aliveGnosia = room.getPlayers().stream()
                .filter(p -> p.isAlive() && p.getRole() == Role.GNOSIA)
                .collect(java.util.stream.Collectors.toList());

        long agreeCount = aliveGnosia.stream()
                .filter(g -> targetId.equals(state.getGnosiaVotes().get(g.getId())))
                .count();

        // Majority: >50% of alive Gnosia must agree (1/1, 2/2, 2/3, 3/4, etc.)
        if (agreeCount * 2 > aliveGnosia.size()) {
            state.setGnosiaTargetPlayerId(targetId);
            log.info("[WARP] CONSENSUS reached. {}/{} Gnosia selected: {}", agreeCount, aliveGnosia.size(), target.getName());
            messagingTemplate.convertAndSend("/topic/room/" + room.getRoomCode() + "/events",
                Map.of("type", "GNOSIA_CONSENSUS", "targetId", targetId, "targetName", target.getName()));
        } else {
            log.info("[WARP] {}/{} Gnosia voted for {}. Consensus not yet reached.", agreeCount, aliveGnosia.size(), target.getName());
        }

        gameService.broadcastState(room);
    }

    @MessageMapping("/room/{roomCode}/signal")
    public void handleSignal(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, Object> payload) {
        String targetId = (String) payload.get("targetId");
        if (targetId != null) {
            messagingTemplate.convertAndSend("/topic/user/" + targetId + "/signal", payload);
        }
    }
}
