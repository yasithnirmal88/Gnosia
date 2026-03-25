package com.gonosia.game.service;

import com.gonosia.game.model.*;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.time.Duration;
import java.util.*;

@Service
public class AnalyticsService {

    public void startTracking(Room room) {
        GameAnalytics analytics = new GameAnalytics();
        analytics.setStartTime(LocalDateTime.now());
        analytics.setVotesPerPlayer(new HashMap<>());
        analytics.setEliminationOrder(new ArrayList<>());
        room.setAnalytics(analytics);
    }

    public void trackVote(Room room, String targetId) {
        if (room.getAnalytics() != null) {
            room.getAnalytics().getVotesPerPlayer().merge(targetId, 1, Integer::sum);
        }
    }

    public void trackElimination(Room room, String killedId) {
        if (room.getAnalytics() != null) {
            room.getAnalytics().getEliminationOrder().add(killedId);
        }
    }

    public void endTracking(Room room, Role winner) {
        GameAnalytics analytics = room.getAnalytics();
        if (analytics != null) {
            analytics.setEndTime(LocalDateTime.now());
            analytics.setWinnerRole(winner);
            analytics.setDurationSeconds((int) Duration.between(analytics.getStartTime(), analytics.getEndTime()).toSeconds());
            
            // Find logic for MVP or most voted
            String mostVoted = analytics.getVotesPerPlayer().entrySet().stream()
                    .max(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .orElse(null);
            analytics.setMvpId(mostVoted); // Placeholder for MVP logic
        }
    }
}
