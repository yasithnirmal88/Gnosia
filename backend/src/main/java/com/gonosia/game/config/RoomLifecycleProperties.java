package com.gonosia.game.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Retention and binding policy for the room lifecycle sweep
 * ({@link com.gonosia.game.service.RoomCleanupService}).
 *
 * <p>All retention periods are seconds (minimum granularity; a value of 0 removes
 * the room as soon as the condition is true). Tests override these with small
 * values so the sweep can be exercised quickly.
 */
@Component
@ConfigurationProperties(prefix = "app.room-lifecycle")
public class RoomLifecycleProperties {

    /** Keep a finished (GAME_OVER) room around for this long so players can view results / reconnect. */
    private int completedRetentionSeconds = 300;

    /** Remove an in-game or lobby room after everyone has been disconnected for this long. */
    private int abandonedRetentionSeconds = 600;

    /** Remove a lobby room that never had a single player join within this window. */
    private int emptyRetentionSeconds = 300;

    /** How often the room cleanup sweep runs. */
    private long sweepIntervalMs = 30000;

    /** Hard cap on the number of voting rounds retained per room (memory bound). */
    private int maxVotingHistory = 100;

    public int getCompletedRetentionSeconds() { return completedRetentionSeconds; }
    public void setCompletedRetentionSeconds(int completedRetentionSeconds) { this.completedRetentionSeconds = completedRetentionSeconds; }

    public int getAbandonedRetentionSeconds() { return abandonedRetentionSeconds; }
    public void setAbandonedRetentionSeconds(int abandonedRetentionSeconds) { this.abandonedRetentionSeconds = abandonedRetentionSeconds; }

    public int getEmptyRetentionSeconds() { return emptyRetentionSeconds; }
    public void setEmptyRetentionSeconds(int emptyRetentionSeconds) { this.emptyRetentionSeconds = emptyRetentionSeconds; }

    public long getSweepIntervalMs() { return sweepIntervalMs; }
    public void setSweepIntervalMs(long sweepIntervalMs) { this.sweepIntervalMs = sweepIntervalMs; }

    public int getMaxVotingHistory() { return maxVotingHistory; }
    public void setMaxVotingHistory(int maxVotingHistory) { this.maxVotingHistory = maxVotingHistory; }
}