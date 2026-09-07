package com.gonosia.game.security;

/**
 * Thrown when a player attempts a game action they are not allowed to perform.
 * Carries the rejected action name and a human-readable reason so the caller can
 * emit a consistent ACTION_REJECTED response on the player's private channel.
 */
public class ActionDeniedException extends RuntimeException {

    private final String action;
    private final String reason;

    public ActionDeniedException(String action, String reason) {
        super(action + ": " + reason);
        this.action = action;
        this.reason = reason;
    }

    public String getAction() { return action; }
    public String getReason() { return reason; }
}