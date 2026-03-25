package com.gonosia.game.model;

public class RoomCreateRequest {
    private String playerId;
    private String roomCode;
    private int participants;
    private String pin;

    public RoomCreateRequest() {}

    public String getPlayerId() { return playerId; }
    public void setPlayerId(String playerId) { this.playerId = playerId; }

    public String getRoomCode() { return roomCode; }
    public void setRoomCode(String roomCode) { this.roomCode = roomCode; }

    public int getParticipants() { return participants; }
    public void setParticipants(int participants) { this.participants = participants; }

    public String getPin() { return pin; }
    public void setPin(String pin) { this.pin = pin; }
}
