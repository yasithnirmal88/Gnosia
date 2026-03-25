package com.gonosia.game.model;

public class Player {
    private String id;
    private String name;
    private String avatar;
    private Role role;
    private boolean isAlive;
    private boolean isCryoslept;
    private String votedFor;
    private boolean isConnected;

    public Player() {}

    public Player(String id, String name, String avatar, Role role, boolean isAlive, boolean isCryoslept, String votedFor, boolean isConnected) {
        this.id = id;
        this.name = name;
        this.avatar = avatar;
        this.role = role;
        this.isAlive = isAlive;
        this.isCryoslept = isCryoslept;
        this.votedFor = votedFor;
        this.isConnected = isConnected;
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

    public boolean isGonosia() {
        return this.role == Role.GONOSIA;
    }

    public static PlayerBuilder builder() { return new PlayerBuilder(); }

    public static class PlayerBuilder {
        private String id;
        private String name;
        private String avatar;
        private Role role;
        private boolean isAlive;
        private boolean isCryoslept;
        private String votedFor;
        private boolean isConnected;

        public PlayerBuilder id(String id) { this.id = id; return this; }
        public PlayerBuilder name(String name) { this.name = name; return this; }
        public PlayerBuilder avatar(String avatar) { this.avatar = avatar; return this; }
        public PlayerBuilder role(Role role) { this.role = role; return this; }
        public PlayerBuilder isAlive(boolean isAlive) { this.isAlive = isAlive; return this; }
        public PlayerBuilder isCryoslept(boolean isCryoslept) { this.isCryoslept = isCryoslept; return this; }
        public PlayerBuilder votedFor(String votedFor) { this.votedFor = votedFor; return this; }
        public PlayerBuilder isConnected(boolean isConnected) { this.isConnected = isConnected; return this; }
        
        public Player build() {
            return new Player(id, name, avatar, role, isAlive, isCryoslept, votedFor, isConnected);
        }
    }
}
