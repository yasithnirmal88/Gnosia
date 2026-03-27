package com.gonosia.game.service;

import com.gonosia.game.model.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class GameService {
    private static final Logger log = LoggerFactory.getLogger(GameService.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final GameLogicService gameLogicService;
    private final AnalyticsService analyticsService;

    public GameService(SimpMessagingTemplate messagingTemplate, GameLogicService gameLogicService,
            AnalyticsService analyticsService) {
        this.messagingTemplate = messagingTemplate;
        this.gameLogicService = gameLogicService;
        this.analyticsService = analyticsService;
    }

    public void transitionPhase(Room room) {
        GameState state = room.getGameState();
        Phase currentPhase = state.getPhase();

        log.info("Transitioning from {} in room {}", currentPhase, room.getRoomCode());

        switch (currentPhase) {
            case LOBBY:
                // Starting game — first meeting
                gameLogicService.assignRoles(room);
                room.incrementMeetingRound(); // Round 1
                state.setPhase(Phase.INTRO);
                state.setRemainingTimeSeconds(14); // 14s for Levi to speak
                analyticsService.startTracking(room);

                // --- Levi: Initial Announcement (3 Lines in Order) ---
                String roleMsg = "Engineer.roles.mp3";
                long eng = room.getPlayers().stream().filter(p -> p.getRole() == Role.ENGINEER).count();
                long doc = room.getPlayers().stream().filter(p -> p.getRole() == Role.DOCTOR).count();
                long ga = room.getPlayers().stream().filter(p -> p.getRole() == Role.GUARDIAN_ANGEL).count();
                
                if (eng > 0 && doc > 0 && ga > 0) roleMsg = "Engineer.doctor.guardianangel.roles.mp3";
                else if (eng > 0 && doc > 0) roleMsg = "Engineer.doctor.roles.mp3";
                else if (eng > 0 && ga > 0) roleMsg = "Engineer.guardianangel.roles.mp3";
                else if (doc > 0 && ga > 0) roleMsg = "doctor.guardianangel.roles.mp3";
                else if (doc > 0) roleMsg = "doctor.roles.mp3";

                String crewMsg = getGnosiaCrewCountAudio(room.getPlayers().size());
                String gnoMsg = getGnosiaCountAudio((int) room.getPlayers().stream().filter(p -> p.getRole() == Role.GNOSIA).count());

                messagingTemplate.convertAndSend("/topic/room/" + room.getRoomCode() + "/events",
                        Map.of("type", "LEVI_ANNOUNCEMENT", "sequence", List.of(crewMsg, gnoMsg, roleMsg)));

                log.info("[START] Game started with sequence: {} -> {} -> {}", crewMsg, gnoMsg, roleMsg);
                break;
            case INTRO:
                state.setPhase(Phase.DISCUSSION);
                state.setRemainingTimeSeconds(room.getConfig().getDiscussionTimeForRound(room.getMeetingRound()));
                break;
            case DISCUSSION:
                state.setPhase(Phase.VOTING);
                state.setRemainingTimeSeconds(room.getConfig().getVotingTimeSeconds());
                state.clearVotes();
                
                // --- Levi: Start Voting ---
                messagingTemplate.convertAndSend("/topic/room/" + room.getRoomCode() + "/events",
                        Map.of("type", "LEVI_ANNOUNCEMENT", "audio", "start.voting.mp3"));
                break;
            case VOTING:
                // Store voting history and disclosed results
                Map<String, String> currentVotesCopy = new HashMap<>(state.getCurrentVotes());
                room.getVotingHistory().add(currentVotesCopy);
                state.setVotingResults(currentVotesCopy); // For reveal in UI
                
                String targetId = gameLogicService.resolveVoting(room);
                state.setLastCryosleptPlayerId(targetId);
                // Put player to cryosleep
                Player selected = room.getPlayer(targetId);
                if (selected != null) {
                    selected.setCryoslept(true);
                    selected.setAlive(false);
                    analyticsService.trackElimination(room, targetId);
                }

                // Check for remaining Gnosia
                boolean gnosiaRemaining = room.getPlayers().stream()
                        .anyMatch(p -> p.isAlive() && p.getRole() == Role.GNOSIA);
                state.setGnosiaStillOnboard(gnosiaRemaining);

                // Behavioral analysis for psychological feedback
                detectBehavioralPatterns(room);
                
                // --- Levi: End Voting ---
                messagingTemplate.convertAndSend("/topic/room/" + room.getRoomCode() + "/events",
                        Map.of("type", "LEVI_ANNOUNCEMENT", "audio", "end.voting.mp3"));

                state.setPhase(Phase.RESULT);
                state.setRemainingTimeSeconds(room.getConfig().getResultTimeSeconds());
                break;
            case RESULT:
                state.setPhase(Phase.CRYOSLEEP);
                state.setRemainingTimeSeconds(10); // 10 seconds for holographic execution

                // --- Levi: Cold Sleep Announcement ---
                Player selectedForCryo = room.getPlayer(state.getLastCryosleptPlayerId());
                if (selectedForCryo != null) {
                    messagingTemplate.convertAndSend("/topic/room/" + room.getRoomCode() + "/events",
                            Map.of("type", "LEVI_ANNOUNCEMENT", "audio", selectedForCryo.getName() + ".coldsleep.mp3"));
                }
                break;
            case CRYOSLEEP:
                Role winner = gameLogicService.checkWin(room); // Refactored to return winner
                if (winner != null) {
                    state.setPhase(Phase.GAME_OVER);
                    analyticsService.endTracking(room, winner);
                    
                    // --- Levi: Victory Announcement ---
                    String winMsg = (winner == Role.GNOSIA) ? "victory_gnosia.mp3" : "victory_human.mp3";
                    messagingTemplate.convertAndSend("/topic/room/" + room.getRoomCode() + "/events",
                        Map.of("type", "LEVI_ANNOUNCEMENT", "audio", winMsg));
                } else {
                    // Transition DIRECTLY to WARP — roles act during the warp sequence now
                    state.setPhase(Phase.WARP);
                    state.clearVotes(); 
                    state.getVotingResults().clear();
                    state.setRemainingTimeSeconds(room.getConfig().getWarpTimeSeconds());

                    // --- Levi: Warp Sequence ---
                    messagingTemplate.convertAndSend("/topic/room/" + room.getRoomCode() + "/events",
                            Map.of("type", "LEVI_ANNOUNCEMENT", "audio", "warp.mp3"));
                }
                break;
            case ROLE_ACTIONS:
                // FALLTHROUGH: Legacy phase handling just in case, skipping immediately
                state.setPhase(Phase.WARP);
                state.setRemainingTimeSeconds(room.getConfig().getWarpTimeSeconds());
                break;
            case WARP: {
                String targetToKill = state.getGnosiaTargetPlayerId();
                String protectedOne = state.getProtectedPlayerId();

                // --- Fallback: if Gonosia never submitted a target, auto-pick a random alive
                // human ---
                if (targetToKill == null || room.getPlayer(targetToKill) == null
                        || !room.getPlayer(targetToKill).isAlive()) {
                    List<Player> eligibleVictims = room.getPlayers().stream()
                            .filter(p -> p.isAlive() && p.getRole() != Role.GNOSIA)
                            .collect(java.util.stream.Collectors.toList());
                    if (!eligibleVictims.isEmpty()) {
                        Collections.shuffle(eligibleVictims);
                        targetToKill = eligibleVictims.get(0).getId();
                        log.info("[WARP] Gnosia did not submit a target. Auto-selected victim: {}",
                                eligibleVictims.get(0).getName());
                    }
                }

                if (targetToKill != null) {
                    if (targetToKill.equals(protectedOne)) {
                        // --- Guardian Angel blocked the kill ---
                        log.info("[WARP] Kill on {} blocked by Guardian Angel shield.", targetToKill);
                        // Broadcast shield event so clients can show the protection animation
                        messagingTemplate.convertAndSend("/topic/room/" + room.getRoomCode() + "/events",
                                Map.of("type", "SHIELD_TRIGGERED", "targetId", targetToKill));
                    } else {
                        // --- Levi: Kill Confirmation ---
                        Player victim = room.getPlayer(targetToKill);
                        if (victim != null && victim.isAlive()) {
                            victim.setAlive(false);
                            analyticsService.trackElimination(room, targetToKill);
                            log.info("[WARP] Gnosia killed: {}", victim.getName());

                            // --- Levi: Kill Confirmation ---
                            messagingTemplate.convertAndSend("/topic/room/" + room.getRoomCode() + "/events",
                                    Map.of("type", "LEVI_ANNOUNCEMENT", "audio", victim.getName() + ".presence.mp3"));
                        }
                    }
                } else {
                    log.warn("[WARP] No valid target found — no kill this round (all humans protected or none alive).");
                }

                generateSmartLeviObservations(room);

                // --- Win-check AFTER Warp Kill ---
                Role warpWinner = gameLogicService.checkWin(room);
                if (warpWinner != null) {
                    state.setPhase(Phase.GAME_OVER);
                    analyticsService.endTracking(room, warpWinner);
                    log.info("[WARP] Game over following elimination. Winner: {}", warpWinner);
                } else {
                    // Morning Meeting transition
                    room.incrementMeetingRound();
                    state.setPhase(Phase.DISCUSSION);
                    int nextTime = room.getConfig().getDiscussionTimeForRound(room.getMeetingRound());
                    state.setRemainingTimeSeconds(nextTime);
                    log.info("[MEETING] Morning Round {} begins — {} seconds", room.getMeetingRound(), nextTime);
                    
                    // Reset per-round transient IDs
                    state.setProtectedPlayerId(null);
                    state.setGnosiaTargetPlayerId(null);
                    state.clearGnosiaVotes(); // reset for next WARP round
                }

                messagingTemplate.convertAndSend("/topic/room/" + room.getRoomCode() + "/events",
                    Map.of("type", "LEVI_ANNOUNCEMENT", "audio", "notification.mp3"));
                break;
            }
            case RESULT:
                // --- Win-check BEFORE opening a new meeting ---
                // If Gonosia count >= humans, Gonosia has taken over the ship — no more
                // meetings.
                Role gameWinner = gameLogicService.checkWin(room);
                if (gameWinner != null) {
                    state.setPhase(Phase.GAME_OVER);
                    analyticsService.endTracking(room, gameWinner);
                    if (gameWinner == Role.GNOSIA) {
                        log.info("[GNOSIA] Ship takeover confirmed. No further meetings. Gnosia wins in room {}",
                                room.getRoomCode());
                    }
                } else {
                    // Continue — next meeting
                    room.incrementMeetingRound();
                    state.setPhase(Phase.DISCUSSION);
                    int nextTime = room.getConfig().getDiscussionTimeForRound(room.getMeetingRound());
                    state.setRemainingTimeSeconds(nextTime);
                    log.info("[MEETING] Round {} begins — {} seconds", room.getMeetingRound(), nextTime);
                }
                // Reset per-round transient IDs
                state.setProtectedPlayerId(null);
                state.setGnosiaTargetPlayerId(null);
                state.clearVotes();
                break;
            default:
                break;
        }
        broadcastState(room);
    }

    private void detectBehavioralPatterns(Room room) {
        GameState state = room.getGameState();
        Map<String, List<String>> insights = new HashMap<>();

        // Find players who voted for the same target in the last round
        Map<String, String> lastVotes = room.getVotingHistory().get(room.getVotingHistory().size() - 1);
        Map<String, List<String>> reverseVotes = new HashMap<>(); // TargetID -> List of VoterIDs

        lastVotes.forEach((voter, target) -> {
            reverseVotes.computeIfAbsent(target, k -> new ArrayList<>()).add(voter);
        });

        reverseVotes.forEach((target, voters) -> {
            if (voters.size() >= 3) {
                insights.put("Voting Block: " + room.getPlayer(target).getName(), voters);
            }
        });

        state.setBehavioralInsights(insights);
    }

    private void generateSmartLeviObservations(Room room) {
        List<String> obs = new ArrayList<>();
        GameState state = room.getGameState();

        // Check for anomalies
        if (state.getProtectedPlayerId() != null
                && state.getProtectedPlayerId().equals(state.getGnosiaTargetPlayerId())) {
            obs.add("Levi AI: Attempted G-Virus containment breach negated by Guardian Angel protocol.");
        }

        state.setLeviObservations(obs);
    }

    public void broadcastState(Room room) {
        // Send state to all
        RoomResponse publicResponse = RoomResponse.fromRoom(room, null);
        messagingTemplate.convertAndSend("/topic/room/" + room.getRoomCode(), publicResponse);

        // Notify each player privately
        List<String> gnosiaIds = room.getPlayers().stream()
                .filter(p -> p.getRole() == Role.GNOSIA)
                .map(Player::getId)
                .collect(Collectors.toList());

        for (Player player : room.getPlayers()) {
            Map<String, Object> privateInfo = new HashMap<>();
            privateInfo.put("type", "PRIVATE_INFO");
            privateInfo.put("role", player.getRole());
            if (player.getRole() == Role.GNOSIA) {
                privateInfo.put("partners", gnosiaIds);
            }
            messagingTemplate.convertAndSend("/topic/user/" + player.getId() + "/private", privateInfo);
        }
    }

    private String getGnosiaCrewCountAudio(int count) {
        if (count < 3) return "3crw.lobby.mp3"; 
        if (count > 15) return "15crw.lobby.mp3";
        return count + "crw.lobby.mp3";
    }

    private String getGnosiaCountAudio(int count) {
        if (count < 1) return "1g.lobby.mp3"; // Or a 0g file if it exists
        if (count > 4) return "4g.lobby.mp3";
        return count + "g.lobby.mp3";
    }
}
