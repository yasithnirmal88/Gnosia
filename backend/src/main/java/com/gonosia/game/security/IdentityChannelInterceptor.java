package com.gonosia.game.security;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;

public class IdentityChannelInterceptor implements ChannelInterceptor {

    private final SessionIdentityService identityService;
    private final RateLimitService rateLimitService;

    public IdentityChannelInterceptor(SessionIdentityService identityService, RateLimitService rateLimitService) {
        this.identityService = identityService;
        this.rateLimitService = rateLimitService;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() != StompCommand.SEND) {
            return message;
        }

        // Catch-all flood guard: bound any inbound app SEND by a per-session/IP
        // budget, so even an unauthenticated session cannot flood the broker with
        // high-frequency frames. Dropped before any handler sees it, so no state is
        // mutated.
        String sessionId = accessor.getSessionId();
        if (!rateLimitService.allowMessageFlood(sessionId)) {
            return null;
        }

        String destination = accessor.getDestination();
        if (destination == null || !destination.startsWith("/app/")) {
            return message;
        }

        if (destination.equals("/app/room/create") || destination.matches("/app/room/[^/]+/join")) {
            return message;
        }

        String playerId = identityService.playerIdForSession(sessionId);
        if (playerId == null) {
            return null;
        }

        accessor.setHeader(SessionIdentityService.ACTOR_HEADER, playerId);
        return message;
    }
}
