package com.gonosia.game.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
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
    private int meetingRound = 0; // Tracks which discussion meeting we are in (1-indexed)

    // ─── Room lifecycle / retention bookkeeping ─────────────────────────────────
    private volatile LifecycleStatus lifecycle = LifecycleStatus.CREATED;
    private volatile long createdAtMillis;
    private volatile long lastActivityMillis;
    private volatile long lastDisconnectMillis;
    private volatile long gameOverAtMillis;

    public Room() {}

    public void initialize() {
        if (players == null) players = new CopyOnWriteArrayList<>();
        if (config == null) config = new GameConfig();
        if (votingHistory == null) votingHistory = new CopyOnWriteArrayList<>();
        long now = System.currentTimeMillis();
        if (createdAtMillis == 0) createdAtMillis = now;
        if (lastActivityMillis == 0) lastActivityMillis = now;
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

    /** Number of players with an open, connected WebSocket session right now. */
    @JsonIgnore
    public int connectedPlayerCount() {
        return players == null ? 0 : (int) players.stream().filter(Player::isConnected).count();
    }

    /**
     * Release heavyweight collections when the room is retired. Safe under
     * concurrency: {@code players} and {@code votingHistory} are copy-on-write
     * lists, and the maps are only touched by holders of this room reference —
     * once the room is unregistered any new traffic sees a null room instead.
     */
    public void clearTransientState() {
        if (players != null) players.clear();
        if (votingHistory != null) votingHistory.clear();
        analytics = null;
        if (gameState != null) {
            gameState.getCurrentVotes().clear();
            gameState.getGnosiaVotes().clear();
            gameState.getVotingResults().clear();
            gameState.getPlayerActionDone().clear();
            gameState.getLastRoleResults().clear();
            gameState.getBehavioralInsights().clear();
            gameState.getLeviObservations().clear();
        }
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

    @JsonIgnore
    public String getPin() { return pin; }
    public void setPin(String pin) { this.pin = pin; }

    public int getMeetingRound() { return meetingRound; }
    public void setMeetingRound(int meetingRound) { this.meetingRound = meetingRound; }
    public void incrementMeetingRound() { this.meetingRound++; }

    public LifecycleStatus getLifecycle() { return lifecycle; }
    public void setLifecycle(LifecycleStatus lifecycle) { this.lifecycle = lifecycle; }

    public long getCreatedAtMillis() { return createdAtMillis; }
    public void setCreatedAtMillis(long createdAtMillis) { this.createdAtMillis = createdAtMillis; }

    public long getLastActivityMillis() { return lastActivityMillis; }
    public void setLastActivityMillis(long lastActivityMillis) { this.lastActivityMillis = lastActivityMillis; }

    public long getLastDisconnectMillis() { return lastDisconnectMillis; }
    public void setLastDisconnectMillis(long lastDisconnectMillis) { this.lastDisconnectMillis = lastDisconnectMillis; }

    public long getGameOverAtMillis() { return gameOverAtMillis; }
    public void setGameOverAtMillis(long gameOverAtMillis) { this.gameOverAtMillis = gameOverAtMillis; }
}