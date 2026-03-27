package com.gonosia.game.model;

import java.util.Map;
import java.util.HashMap;
import java.util.List;
import java.util.ArrayList;

public class GameState {
    private Phase phase = Phase.LOBBY;
    private int remainingTimeSeconds;
    private Map<String, String> currentVotes = new HashMap<>(); // SourcePlayerID -> TargetPlayerID
    private String lastCryosleptPlayerId;
    private String protectedPlayerId;
    private String gnosiaTargetPlayerId;
    private Map<String, String> lastRoleResults = new HashMap<>(); // PlayerID -> Results
    private List<String> leviObservations = new ArrayList<>(); // AI Narrator's insights
    private Map<String, List<String>> behavioralInsights = new HashMap<>(); // e.g., "Frequent Partners" -> List of IDs
    private Map<String, String> gnosiaVotes = new HashMap<>(); // GnosiaID -> TargetID (WARP phase consensus)
    private Map<String, String> votingResults = new HashMap<>(); // VoterID -> TargetID (revealed results)
    private Role winner; // To store the game winner (HUMAN or GNOSIA)
    private boolean gnosiaStillOnboard;

    public GameState() {}

    public GameState(Phase phase, int remainingTimeSeconds, Map<String, String> currentVotes, String lastCryosleptPlayerId, String protectedPlayerId, String gnosiaTargetPlayerId, Map<String, String> lastRoleResults, List<String> leviObservations, Map<String, List<String>> behavioralInsights) {
        this.phase = phase;
        this.remainingTimeSeconds = remainingTimeSeconds;
        this.currentVotes = currentVotes;
        this.lastCryosleptPlayerId = lastCryosleptPlayerId;
        this.protectedPlayerId = protectedPlayerId;
        this.gnosiaTargetPlayerId = gnosiaTargetPlayerId;
        this.lastRoleResults = lastRoleResults;
        this.leviObservations = leviObservations;
        this.behavioralInsights = behavioralInsights;
    }

    public void clearVotes() {
        if (currentVotes != null) {
            currentVotes.clear();
        } else {
            currentVotes = new HashMap<>();
        }
    }

    // Getters and Setters
    public Phase getPhase() { return phase; }
    public void setPhase(Phase phase) { this.phase = phase; }

    public int getRemainingTimeSeconds() { return remainingTimeSeconds; }
    public void setRemainingTimeSeconds(int remainingTimeSeconds) { this.remainingTimeSeconds = remainingTimeSeconds; }

    public Map<String, String> getCurrentVotes() { return currentVotes; }
    public void setCurrentVotes(Map<String, String> currentVotes) { this.currentVotes = currentVotes; }

    public String getLastCryosleptPlayerId() { return lastCryosleptPlayerId; }
    public void setLastCryosleptPlayerId(String lastCryosleptPlayerId) { 
        this.lastCryosleptPlayerId = (lastCryosleptPlayerId == null) ? "" : lastCryosleptPlayerId; 
    }

    public String getProtectedPlayerId() { return protectedPlayerId; }
    public void setProtectedPlayerId(String protectedPlayerId) { 
        this.protectedPlayerId = (protectedPlayerId == null) ? "" : protectedPlayerId; 
    }

    public String getGnosiaTargetPlayerId() { return gnosiaTargetPlayerId; }
    public void setGnosiaTargetPlayerId(String gnosiaTargetPlayerId) { 
        this.gnosiaTargetPlayerId = (gnosiaTargetPlayerId == null) ? "" : gnosiaTargetPlayerId; 
    }

    public Map<String, String> getLastRoleResults() { return lastRoleResults; }
    public void setLastRoleResults(Map<String, String> lastRoleResults) { this.lastRoleResults = lastRoleResults; }

    public List<String> getLeviObservations() { return leviObservations; }
    public void setLeviObservations(List<String> leviObservations) { this.leviObservations = leviObservations; }

    public Map<String, List<String>> getBehavioralInsights() { return behavioralInsights; }
    public void setBehavioralInsights(Map<String, List<String>> behavioralInsights) { this.behavioralInsights = behavioralInsights; }

    public Map<String, String> getGnosiaVotes() { return gnosiaVotes; }
    public void setGnosiaVotes(Map<String, String> gnosiaVotes) { this.gnosiaVotes = gnosiaVotes; }
    public void clearGnosiaVotes() { this.gnosiaVotes = new HashMap<>(); }

    public Map<String, String> getVotingResults() { return votingResults; }
    public void setVotingResults(Map<String, String> votingResults) { this.votingResults = votingResults; }
    
    public Role getWinner() { return winner; }
    public void setWinner(Role winner) { this.winner = winner; }

    public boolean isGnosiaStillOnboard() { return gnosiaStillOnboard; }
    public void setGnosiaStillOnboard(boolean gnosiaStillOnboard) { this.gnosiaStillOnboard = gnosiaStillOnboard; }

    public static GameStateBuilder builder() { return new GameStateBuilder(); }

    public static class GameStateBuilder {
        private Phase phase = Phase.LOBBY;
        private int remainingTimeSeconds;
        private Map<String, String> currentVotes;
        private String lastCryosleptPlayerId;
        private String protectedPlayerId;
        private String gnosiaTargetPlayerId;
        private Map<String, String> lastRoleResults;
        private List<String> leviObservations;
        private Map<String, List<String>> behavioralInsights;

        public GameStateBuilder phase(Phase phase) { this.phase = phase; return this; }
        public GameStateBuilder remainingTimeSeconds(int remainingTimeSeconds) { this.remainingTimeSeconds = remainingTimeSeconds; return this; }
        public GameStateBuilder currentVotes(Map<String, String> currentVotes) { this.currentVotes = currentVotes; return this; }
        public GameStateBuilder lastCryosleptPlayerId(String lastCryosleptPlayerId) { this.lastCryosleptPlayerId = lastCryosleptPlayerId; return this; }
        public GameStateBuilder protectedPlayerId(String protectedPlayerId) { this.protectedPlayerId = protectedPlayerId; return this; }
        public GameStateBuilder gnosiaTargetPlayerId(String gnosiaTargetPlayerId) { this.gnosiaTargetPlayerId = gnosiaTargetPlayerId; return this; }
        public GameStateBuilder lastRoleResults(Map<String, String> lastRoleResults) { this.lastRoleResults = lastRoleResults; return this; }
        public GameStateBuilder leviObservations(List<String> leviObservations) { this.leviObservations = leviObservations; return this; }
        public GameStateBuilder behavioralInsights(Map<String, List<String>> behavioralInsights) { this.behavioralInsights = behavioralInsights; return this; }

        public GameState build() {
            return new GameState(phase, remainingTimeSeconds, currentVotes, lastCryosleptPlayerId, protectedPlayerId, gnosiaTargetPlayerId, lastRoleResults, leviObservations, behavioralInsights);
        }
    }
}
