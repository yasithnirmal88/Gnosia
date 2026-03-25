package com.gonosia.game.model;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.HashMap;
import java.util.List;
import java.util.ArrayList;

public class GameAnalytics {
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private int durationSeconds;
    private Role winnerRole;
    private Map<String, Integer> votesPerPlayer = new HashMap<>();
    private List<String> eliminationOrder = new ArrayList<>();
    private String mvpId;

    public GameAnalytics() {}

    public LocalDateTime getStartTime() { return startTime; }
    public void setStartTime(LocalDateTime startTime) { this.startTime = startTime; }

    public LocalDateTime getEndTime() { return endTime; }
    public void setEndTime(LocalDateTime endTime) { this.endTime = endTime; }

    public int getDurationSeconds() { return durationSeconds; }
    public void setDurationSeconds(int durationSeconds) { this.durationSeconds = durationSeconds; }

    public Role getWinnerRole() { return winnerRole; }
    public void setWinnerRole(Role winnerRole) { this.winnerRole = winnerRole; }

    public Map<String, Integer> getVotesPerPlayer() { return votesPerPlayer; }
    public void setVotesPerPlayer(Map<String, Integer> votesPerPlayer) { this.votesPerPlayer = votesPerPlayer; }

    public List<String> getEliminationOrder() { return eliminationOrder; }
    public void setEliminationOrder(List<String> eliminationOrder) { this.eliminationOrder = eliminationOrder; }

    public String getMvpId() { return mvpId; }
    public void setMvpId(String mvpId) { this.mvpId = mvpId; }
}
