package com.gonosia.game.model;

public class PlayerResponse {
    private String id;
    private String name;
    private String avatar;
    private Role role;
    private boolean isAlive;
    private boolean isCryoslept;
    private String votedFor;
    private boolean isConnected;

    public PlayerResponse() {}

    public static PlayerResponse fromPlayer(Player p, boolean showRole) {
        PlayerResponse r = new PlayerResponse();
        r.setId(p.getId());
        r.setName(p.getName());
        r.setAvatar(p.getAvatar());
        r.setAlive(p.isAlive());
        r.setCryoslept(p.isCryoslept());
        r.setVotedFor(p.getVotedFor());
        r.setConnected(p.isConnected());
        if (showRole) {
            r.setRole(p.getRole());
        }
        return r;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getAvatar() { return avatar; }
    public void setAvatar(String avatar) { this.avatar = avatar; }

    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }

    public boolean isAlive() { return isAlive; }
    public void setAlive(boolean alive) { isAlive = alive; }

    public boolean isCryoslept() { return isCryoslept; }
    public void setCryoslept(boolean cryoslept) { isCryoslept = cryoslept; }

    public String getVotedFor() { return votedFor; }
    public void setVotedFor(String votedFor) { this.votedFor = votedFor; }

    public boolean isConnected() { return isConnected; }
    public void setConnected(boolean connected) { isConnected = connected; }
}
