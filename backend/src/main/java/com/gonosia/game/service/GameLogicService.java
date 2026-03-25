package com.gonosia.game.service;

import com.gonosia.game.model.*;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class GameLogicService {
    private static final Logger log = LoggerFactory.getLogger(GameLogicService.class);
    private final Random random = new Random();

    public void assignRoles(Room room) {
        List<Player> players = room.getPlayers();
        int playerCount = players.size();

        if (playerCount < 5) {
            log.warn("Need at least 5 players for a balanced Gnosia game. Proceeding for testing.");
        }

        // Reset roles
        players.forEach(p -> {
            p.setRole(null);
            p.setAlive(true);
            p.setCryoslept(false);
        });

        Collections.shuffle(players);

        int gnosiaCount;
        List<Role> specialRoles = new ArrayList<>();

        if (playerCount <= 5) {
            // 5 players (fixed limit): 1 Gnosia + 1 Engineer for balance
            gnosiaCount = 1;
            specialRoles.add(Role.ENGINEER);
        } else if (playerCount <= 10) {
            // 6-10 players: 2 Gnosia + one random "timeline" of special roles
            gnosiaCount = 2;
            // 5 possible timelines, randomly selected each game
            int timeline = random.nextInt(5);
            switch (timeline) {
                case 0 -> specialRoles.add(Role.ENGINEER);
                case 1 -> specialRoles.add(Role.DOCTOR);
                case 2 -> { specialRoles.add(Role.DOCTOR); specialRoles.add(Role.GUARDIAN_ANGEL); }
                case 3 -> { specialRoles.add(Role.ENGINEER); specialRoles.add(Role.DOCTOR); }
                case 4 -> { specialRoles.add(Role.ENGINEER); specialRoles.add(Role.GUARDIAN_ANGEL); }
            }
            log.info("[ROLES] 6-10 player timeline #{} chosen: {}", timeline, specialRoles);

        } else {
            // 11-15 players: 3 Gnosia + all special roles
            gnosiaCount = 3;
            specialRoles.add(Role.ENGINEER);
            specialRoles.add(Role.DOCTOR);
            specialRoles.add(Role.GUARDIAN_ANGEL);
        }

        // Allow config override for gonosiaCount
        if (room.getConfig() != null && room.getConfig().getGnosiaCount() > 0) {
            gnosiaCount = room.getConfig().getGnosiaCount();
        }

        int index = 0;
        for (int i = 0; i < gnosiaCount && index < playerCount; i++) {
            players.get(index++).setRole(Role.GNOSIA);
        }
        for (Role role : specialRoles) {
            if (index < playerCount) players.get(index++).setRole(role);
        }
        while (index < playerCount) {
            players.get(index++).setRole(Role.HUMAN);
        }

        // Final shuffle so roles are hidden
        Collections.shuffle(players);
        log.info("[ROLES] Assigned {} Gnosia, special roles: {} for {} players",
                gnosiaCount, specialRoles, playerCount);
    }

    public String resolveVoting(Room room) {
        GameState state = room.getGameState();
        Map<String, Integer> votesCount = new HashMap<>();
        
        state.getCurrentVotes().values().forEach(targetId -> {
            votesCount.merge(targetId, 1, (a, b) -> a + b);
        });
        
        if (votesCount.isEmpty()) return null;
        
        // Find player with highest votes
        String targetPlayerId = votesCount.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse(null);
        
        return targetPlayerId;
    }

    public Role checkWin(Room room) {
        List<Player> alivePlayers = room.getPlayers().stream()
                .filter(Player::isAlive)
                .collect(Collectors.toList());
        
        long gnosiaCount = alivePlayers.stream().filter(p -> p.getRole() == Role.GNOSIA).count();
        long humansCount = alivePlayers.size() - gnosiaCount;
        
        if (gnosiaCount == 0) {
            log.info("Humans win in room " + room.getRoomCode());
            room.getGameState().setWinner(Role.HUMAN);
            return Role.HUMAN; 
        }
        
        if (gnosiaCount >= humansCount) {
            log.info("Gnosia win in room " + room.getRoomCode());
            room.getGameState().setWinner(Role.GNOSIA);
            return Role.GNOSIA;
        }
        
        return null; // Game continues
    }
}
