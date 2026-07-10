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
        if (room == null) return;

        String voterId = payload.get("voterId");
        Player voter = room.getPlayer(voterId);

        if (voter == null) {
            log.warn("[REJECTED] VOTE by unknown player {}: player not in room", voterId);
            return;
        }

        String voterName = voter.getName();

        if (room.getGameState().getPhase() != Phase.VOTING) {
            log.warn("[REJECTED] VOTE by {}: wrong phase {}", voterName, room.getGameState().getPhase());
            messagingTemplate.convertAndSend("/topic/user/" + voterId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "VOTE", "reason", "Voting is not active right now"));
            return;
        }

        if (!voter.isAlive()) {
            log.warn("[REJECTED] VOTE by dead player {}", voterName);
            messagingTemplate.convertAndSend("/topic/user/" + voterId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "VOTE", "reason", "Dead crew members cannot vote"));
            return;
        }

        if (voter.isCryoslept()) {
            log.warn("[REJECTED] VOTE by cryoslept player {}", voterName);
            messagingTemplate.convertAndSend("/topic/user/" + voterId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "VOTE", "reason", "Cryoslept crew members cannot vote"));
            return;
        }

        room.getGameState().getCurrentVotes().put(voterId, payload.get("targetId"));
        room.getGameState().getPlayerActionDone().put(voterId, "VOTED");
        log.info("[VOTE] {} voted for {}", voterName, payload.get("targetId"));
        gameService.broadcastState(room);
    }

    @MessageMapping("/room/{roomCode}/scan")
    public void scan(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload) {
        Room room = roomManager.getRoom(roomCode);
        log.info("[SCAN] Payload received for room {}: {}", roomCode, payload);
        if (room == null) return;

        String scannerId = payload.get("scannerId");
        Player scanner = room.getPlayer(scannerId);

        if (scanner == null) {
            log.warn("[REJECTED] SCAN by unknown player {}: player not in room", scannerId);
            return;
        }

        String scannerName = scanner.getName();

        if (room.getGameState().getPhase() != Phase.WARP) {
            log.warn("[REJECTED] SCAN by {}: wrong phase {}", scannerName, room.getGameState().getPhase());
            messagingTemplate.convertAndSend("/topic/user/" + scannerId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "SCAN", "reason", "Engineer scan is only available during WARP"));
            return;
        }

        if (!scanner.isAlive()) {
            log.warn("[REJECTED] SCAN by dead player {}", scannerName);
            messagingTemplate.convertAndSend("/topic/user/" + scannerId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "SCAN", "reason", "Dead crew members cannot scan"));
            return;
        }

        if (scanner.isCryoslept()) {
            log.warn("[REJECTED] SCAN by cryoslept player {}", scannerName);
            messagingTemplate.convertAndSend("/topic/user/" + scannerId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "SCAN", "reason", "Cryoslept crew members cannot scan"));
            return;
        }

        if (scanner.getRole() != Role.ENGINEER) {
            log.warn("[REJECTED] SCAN by non-Engineer {} (role: {})", scannerName, scanner.getRole());
            messagingTemplate.convertAndSend("/topic/user/" + scannerId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "SCAN", "reason", "Only the Engineer can scan"));
            return;
        }

        Player target = room.getPlayer(payload.get("targetId"));
        if (target == null) {
            log.warn("[REJECTED] SCAN by {}: target player not found", scannerName);
            messagingTemplate.convertAndSend("/topic/user/" + scannerId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "SCAN", "reason", "Target player not found"));
            return;
        }

        log.info("[SCAN] Scanner={}, Target={}", scannerName, target.getName());
        String result = target.getRole() == Role.GNOSIA ? "GNOSIA" : "HUMAN";
        messagingTemplate.convertAndSend("/topic/user/" + scanner.getId() + "/private", 
            Map.of("type", "SCAN_RESULT", "targetId", target.getId(), "result", result));
        room.getGameState().getPlayerActionDone().put(scanner.getId(), "SCANNED");
        log.info("[SCAN] Result sent to {}: {}", scannerName, result);
        gameService.broadcastState(room);
    }

    @MessageMapping("/room/{roomCode}/doctorCheck")
    public void doctorCheck(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload) {
        Room room = roomManager.getRoom(roomCode);
        log.info("[DOCTOR] Payload received for room {}: {}", roomCode, payload);
        if (room == null) return;

        String doctorId = payload.get("doctorId");
        Player doctor = room.getPlayer(doctorId);

        if (doctor == null) {
            log.warn("[REJECTED] DOCTOR_CHECK by unknown player {}: player not in room", doctorId);
            return;
        }

        String doctorName = doctor.getName();

        if (room.getGameState().getPhase() != Phase.WARP) {
            log.warn("[REJECTED] DOCTOR_CHECK by {}: wrong phase {}", doctorName, room.getGameState().getPhase());
            messagingTemplate.convertAndSend("/topic/user/" + doctorId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "DOCTOR_CHECK", "reason", "Doctor check is only available during WARP"));
            return;
        }

        if (!doctor.isAlive()) {
            log.warn("[REJECTED] DOCTOR_CHECK by dead player {}", doctorName);
            messagingTemplate.convertAndSend("/topic/user/" + doctorId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "DOCTOR_CHECK", "reason", "Dead crew members cannot perform a check"));
            return;
        }

        if (doctor.isCryoslept()) {
            log.warn("[REJECTED] DOCTOR_CHECK by cryoslept player {}", doctorName);
            messagingTemplate.convertAndSend("/topic/user/" + doctorId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "DOCTOR_CHECK", "reason", "Cryoslept crew members cannot perform a check"));
            return;
        }

        if (doctor.getRole() != Role.DOCTOR) {
            log.warn("[REJECTED] DOCTOR_CHECK by non-Doctor {} (role: {})", doctorName, doctor.getRole());
            messagingTemplate.convertAndSend("/topic/user/" + doctorId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "DOCTOR_CHECK", "reason", "Only the Doctor can perform a check"));
            return;
        }

        String targetId = payload.get("targetId");
        Player target = room.getPlayer(targetId);

        if (target == null) {
            log.warn("[REJECTED] DOCTOR_CHECK by {}: target player not found", doctorName);
            messagingTemplate.convertAndSend("/topic/user/" + doctorId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "DOCTOR_CHECK", "reason", "Target player not found"));
            return;
        }

        if (!target.isCryoslept()) {
            log.warn("[REJECTED] DOCTOR_CHECK by {}: target {} is not cryoslept", doctorName, target.getName());
            messagingTemplate.convertAndSend("/topic/user/" + doctorId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "DOCTOR_CHECK", "reason", "You can only check cryoslept crew members"));
            return;
        }

        log.info("[DOCTOR] Doctor={}, Target={}, TargetCryoslept={}", doctorName, target.getName(), target.isCryoslept());
        String result = target.getRole() == Role.GNOSIA ? "GNOSIA" : "HUMAN";
        messagingTemplate.convertAndSend("/topic/user/" + doctor.getId() + "/private", 
            Map.of("type", "DOCTOR_CHECK_RESULT", "targetId", target.getId(), "result", result));
        room.getGameState().getPlayerActionDone().put(doctor.getId(), "DOCTOR_CHECKED");
        log.info("[DOCTOR] Result sent to {}: {}", doctorName, result);
        gameService.broadcastState(room);
    }

    @MessageMapping("/room/{roomCode}/protect")
    public void protect(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        String gaId = payload.get("gaId");
        Player ga = room.getPlayer(gaId);

        if (ga == null) {
            log.warn("[REJECTED] PROTECT by unknown player {}: player not in room", gaId);
            return;
        }

        String gaName = ga.getName();

        if (room.getGameState().getPhase() != Phase.WARP) {
            log.warn("[REJECTED] PROTECT by {}: wrong phase {}", gaName, room.getGameState().getPhase());
            messagingTemplate.convertAndSend("/topic/user/" + gaId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "PROTECT", "reason", "Guardian Angel protect is only available during WARP"));
            return;
        }

        if (!ga.isAlive()) {
            log.warn("[REJECTED] PROTECT by dead player {}", gaName);
            messagingTemplate.convertAndSend("/topic/user/" + gaId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "PROTECT", "reason", "Dead crew members cannot protect"));
            return;
        }

        if (ga.isCryoslept()) {
            log.warn("[REJECTED] PROTECT by cryoslept player {}", gaName);
            messagingTemplate.convertAndSend("/topic/user/" + gaId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "PROTECT", "reason", "Cryoslept crew members cannot protect"));
            return;
        }

        if (ga.getRole() != Role.GUARDIAN_ANGEL) {
            log.warn("[REJECTED] PROTECT by non-GA {} (role: {})", gaName, ga.getRole());
            messagingTemplate.convertAndSend("/topic/user/" + gaId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "PROTECT", "reason", "Only the Guardian Angel can protect"));
            return;
        }

        Player target = room.getPlayer(payload.get("targetId"));
        if (target == null) {
            log.warn("[REJECTED] PROTECT by {}: target player not found", gaName);
            messagingTemplate.convertAndSend("/topic/user/" + gaId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "PROTECT", "reason", "Target player not found"));
            return;
        }

        log.info("[PROTECT] {} shielded: {}", gaName, target.getName());
        room.getGameState().setProtectedPlayerId(payload.get("targetId"));
        room.getGameState().getPlayerActionDone().put(ga.getId(), "PROTECTED");
        gameService.broadcastState(room);
    }

    @MessageMapping("/room/{roomCode}/kill")
    public void kill(@DestinationVariable("roomCode") String roomCode, @Payload Map<String, String> payload) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        String gnosiaId = payload.get("voterId");
        Player gnosia = room.getPlayer(gnosiaId);

        if (gnosia == null) {
            log.warn("[REJECTED] KILL by unknown player {}: player not in room", gnosiaId);
            return;
        }

        String gnosiaName = gnosia.getName();

        if (room.getGameState().getPhase() != Phase.WARP) {
            log.warn("[REJECTED] KILL by {}: wrong phase {}", gnosiaName, room.getGameState().getPhase());
            messagingTemplate.convertAndSend("/topic/user/" + gnosiaId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "KILL", "reason", "Kill vote is only available during WARP"));
            return;
        }

        if (!gnosia.isAlive()) {
            log.warn("[REJECTED] KILL by dead player {}", gnosiaName);
            messagingTemplate.convertAndSend("/topic/user/" + gnosiaId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "KILL", "reason", "Dead Gnosia cannot vote to kill"));
            return;
        }

        if (gnosia.isCryoslept()) {
            log.warn("[REJECTED] KILL by cryoslept player {}", gnosiaName);
            messagingTemplate.convertAndSend("/topic/user/" + gnosiaId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "KILL", "reason", "Cryoslept Gnosia cannot vote to kill"));
            return;
        }

        if (gnosia.getRole() != Role.GNOSIA) {
            log.warn("[REJECTED] KILL by non-Gnosia {} (role: {})", gnosiaName, gnosia.getRole());
            messagingTemplate.convertAndSend("/topic/user/" + gnosiaId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "KILL", "reason", "Only Gnosia can vote to kill"));
            return;
        }

        String targetId = payload.get("targetId");
        Player target = room.getPlayer(targetId);
        if (target == null || !target.isAlive() || target.getRole() == Role.GNOSIA) {
            log.warn("[REJECTED] KILL by {}: invalid target '{}'. Must be an alive non-Gnosia player.", gnosiaName, targetId);
            messagingTemplate.convertAndSend("/topic/user/" + gnosiaId + "/private",
                Map.of("type", "ACTION_REJECTED", "action", "KILL", "reason", "Invalid target — must be an alive human crew member"));
            return;
        }

        GameState state = room.getGameState();
        state.getGnosiaVotes().put(gnosia.getId(), targetId);
        state.getPlayerActionDone().put(gnosia.getId(), "KILL_VOTE_CAST");
        log.info("[WARP] {} voted to kill: {}", gnosia.getName(), target.getName());

        // Log all current Gnosia votes
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
            log.info("[WARP] {}/{} Gnosia voted for {}. Consensus threshold {}/{} not met.", 
                     agreeCount, aliveGnosia.size(), target.getName(), 
                     aliveGnosia.size() / 2 + 1, aliveGnosia.size());
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
