package com.gonosia.game.model;

public class GameConfig {
    private int maxPlayers = 15;
    private int gonosiaCount = 0; // 0 means auto

    // TEST: short timers
    private static final int[] DISCUSSION_TIMES = { 0, 20, 20, 20, 20 };

    private int votingTimeSeconds = 30;
    private int resultTimeSeconds = 15;
    private int roleActionTimeSeconds = 60;
    private int warpTimeSeconds = 120;

    public GameConfig() {}

    /**
     * Returns the discussion time for a given meeting round.
     * Round 1 → 5 min (300s), Rounds 2+ → 10 min (600s).
     */
    public int getDiscussionTimeForRound(int round) {
        if (round <= 0) return DISCUSSION_TIMES[1];
        if (round < DISCUSSION_TIMES.length) return DISCUSSION_TIMES[round];
        return DISCUSSION_TIMES[DISCUSSION_TIMES.length - 1]; // cap at last configured round time
    }

    /** Kept for backwards-compat, returns the round-1 (first meeting) default. */
    public int getDiscussionTimeSeconds() { return DISCUSSION_TIMES[1]; }
    public void setDiscussionTimeSeconds(int t) { /* no-op: times are fixed per-round */ }

    public int getMaxPlayers() { return maxPlayers; }
    public void setMaxPlayers(int maxPlayers) { this.maxPlayers = maxPlayers; }

    public int getGonosiaCount() { return gonosiaCount; }
    public void setGonosiaCount(int gonosiaCount) { this.gonosiaCount = gonosiaCount; }

    public int getVotingTimeSeconds() { return votingTimeSeconds; }
    public void setVotingTimeSeconds(int votingTimeSeconds) { this.votingTimeSeconds = votingTimeSeconds; }

    public int getResultTimeSeconds() { return resultTimeSeconds; }
    public void setResultTimeSeconds(int resultTimeSeconds) { this.resultTimeSeconds = resultTimeSeconds; }

    public int getRoleActionTimeSeconds() { return roleActionTimeSeconds; }
    public void setRoleActionTimeSeconds(int roleActionTimeSeconds) { this.roleActionTimeSeconds = roleActionTimeSeconds; }

    public int getWarpTimeSeconds() { return warpTimeSeconds; }
    public void setWarpTimeSeconds(int warpTimeSeconds) { this.warpTimeSeconds = warpTimeSeconds; }
}
