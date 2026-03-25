package com.gonosia.game.model;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class RoomResponse {
    private String roomCode;
    private List<PlayerResponse> players;
    private GameState gameState;
    private GameAnalytics analytics;
    private List<Map<String, String>> votingHistory;
    private GameConfig config;

    public RoomResponse() {}

    public static RoomResponse fromRoom(Room room, String recipientPlayerId) {
        Player recipient = room.getPlayer(recipientPlayerId);
        boolean showAllRoles = recipient != null && (!recipient.isAlive() || recipient.isCryoslept());
        
        RoomResponse r = new RoomResponse();
        r.setRoomCode(room.getRoomCode());
        r.setGameState(room.getGameState());
        r.setAnalytics(room.getAnalytics());
        r.setVotingHistory(room.getVotingHistory());
        r.setConfig(room.getConfig());
        if (room.getPlayers() != null) {
            r.setPlayers(room.getPlayers().stream()
                .map(p -> PlayerResponse.fromPlayer(p, showAllRoles || p.getId().equals(recipientPlayerId)))
                .collect(Collectors.toList()));
        }
        return r;
    }

    public String getRoomCode() { return roomCode; }
    public void setRoomCode(String roomCode) { this.roomCode = roomCode; }

    public List<PlayerResponse> getPlayers() { return players; }
    public void setPlayers(List<PlayerResponse> players) { this.players = players; }

    public GameState getGameState() { return gameState; }
    public void setGameState(GameState gameState) { this.gameState = gameState; }

    public GameAnalytics getAnalytics() { return analytics; }
    public void setAnalytics(GameAnalytics analytics) { this.analytics = analytics; }

    public List<Map<String, String>> getVotingHistory() { return votingHistory; }
    public void setVotingHistory(List<Map<String, String>> votingHistory) { this.votingHistory = votingHistory; }

    public GameConfig getConfig() { return config; }
    public void setConfig(GameConfig config) { this.config = config; }
}
