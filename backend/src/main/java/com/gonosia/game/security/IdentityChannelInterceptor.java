package com.gonosia.game.security;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;

public class IdentityChannelInterceptor implements ChannelInterceptor {

    private final SessionIdentityService identityService;

    public IdentityChannelInterceptor(SessionIdentityService identityService) {
        this.identityService = identityService;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() != StompCommand.SEND) {
            return message;
        }

        String destination = accessor.getDestination();
        if (destination == null || !destination.startsWith("/app/")) {
            return message;
        }

        if (destination.equals("/app/room/create") || destination.matches("/app/room/[^/]+/join")) {
            return message;
        }

        String sessionId = accessor.getSessionId();
        String playerId = identityService.playerIdForSession(sessionId);
        if (playerId == null) {
            return null;
        }

        accessor.setHeader(SessionIdentityService.ACTOR_HEADER, playerId);
        return message;
    }
}