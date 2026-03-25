package com.gonosia.game.model;

public class RoomJoinRequest {
    private String id;
    private String pin;

    public RoomJoinRequest() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getPin() { return pin; }
    public void setPin(String pin) { this.pin = pin; }
}
