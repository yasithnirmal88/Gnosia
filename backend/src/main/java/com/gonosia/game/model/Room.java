package com.gonosia.game.model;

import java.util.List;
import java.util.ArrayList;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.Map;

public class Room {
    private String roomCode;
    private List<Player> players = new CopyOnWriteArrayList<>();
    private GameState gameState;
    private GameConfig config = new GameConfig();
    private GameAnalytics analytics;
    private String pin;
    private List<Map<String, String>> votingHistory = new CopyOnWriteArrayList<>();
    private Map<String, String> sessionIdToPlayerId = new java.util.concurrent.ConcurrentHashMap<>();
    private int meetingRound = 0; // Tracks which discussion meeting we are in (1-indexed)
    
    public Room() {}

    public void initialize() {
        if (players == null) players = new CopyOnWriteArrayList<>();
        if (config == null) config = new GameConfig();
        if (votingHistory == null) votingHistory = new CopyOnWriteArrayList<>();
        if (sessionIdToPlayerId == null) sessionIdToPlayerId = new java.util.concurrent.ConcurrentHashMap<>();
    }

    public void addPlayer(Player player) {
        if (players == null) players = new CopyOnWriteArrayList<>();
        if (config == null) config = new GameConfig();
        if (players.size() < config.getMaxPlayers()) {
            players.add(player);
        }
    }

    public void removePlayer(String playerId) {
        if (players != null) {
            players.removeIf(p -> p.getId().equals(playerId));
        }
    }

    public Player getPlayer(String playerId) {
        return players.stream().filter(p -> p.getId().equals(playerId)).findFirst().orElse(null);
    }

    public String getRoomCode() { return roomCode; }
    public void setRoomCode(String roomCode) { this.roomCode = roomCode; }

    public List<Player> getPlayers() { return players; }
    public void setPlayers(List<Player> players) { this.players = players; }

    public GameState getGameState() { return gameState; }
    public void setGameState(GameState gameState) { this.gameState = gameState; }

    public GameConfig getConfig() { return config; }
    public void setConfig(GameConfig config) { this.config = config; }

    public GameAnalytics getAnalytics() { return analytics; }
    public void setAnalytics(GameAnalytics analytics) { this.analytics = analytics; }

    public List<Map<String, String>> getVotingHistory() { return votingHistory; }
    public void setVotingHistory(List<Map<String, String>> votingHistory) { this.votingHistory = votingHistory; }

    public String getPin() { return pin; }
    public void setPin(String pin) { this.pin = pin; }

    public int getMeetingRound() { return meetingRound; }
    public void setMeetingRound(int meetingRound) { this.meetingRound = meetingRound; }
    public void incrementMeetingRound() { this.meetingRound++; }

    public Map<String, String> getSessionIdToPlayerId() { return sessionIdToPlayerId; }
    public void setSessionIdToPlayerId(Map<String, String> sessionIdToPlayerId) { this.sessionIdToPlayerId = sessionIdToPlayerId; }
}
