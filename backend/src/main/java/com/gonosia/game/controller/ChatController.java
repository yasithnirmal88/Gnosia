package com.gonosia.game.controller;

import com.gonosia.game.model.*;
import com.gonosia.game.security.SessionIdentityService;
import com.gonosia.game.service.RoomManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import java.util.Map;

@Controller
public class ChatController {
    private static final Logger log = LoggerFactory.getLogger(ChatController.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final RoomManager roomManager;
    private final SessionIdentityService identityService;

    public ChatController(SimpMessagingTemplate messagingTemplate, RoomManager roomManager,
            SessionIdentityService identityService) {
        this.messagingTemplate = messagingTemplate;
        this.roomManager = roomManager;
        this.identityService = identityService;
    }

    private SessionIdentityService.Actor requireActor(SimpMessageHeaderAccessor headerAccessor, String roomCode, Room room) {
        String sessionId = headerAccessor != null ? headerAccessor.getSessionId() : null;
        return identityService.requireActor(sessionId, room);
    }

    @MessageMapping("/room/{roomCode}/chat")
    public void handleChat(@DestinationVariable String roomCode, @Payload ChatMessage message,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireActor(headerAccessor, roomCode, room);
        if (actor == null) return;

        Player sender = actor.player();
        if (!sender.isAlive()) return;

        ChatMessage msg = new ChatMessage();
        msg.setSenderId(sender.getId());
        msg.setSenderName(sender.getName());
        msg.setContent(message.getContent());
        msg.setGonosiaOnly(message.isGonosiaOnly());

        messagingTemplate.convertAndSend("/topic/room/" + roomCode + "/chat", msg);
    }

    @MessageMapping("/room/{roomCode}/dm")
    public void handleDm(@DestinationVariable String roomCode, @Payload Map<String, String> payload,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireActor(headerAccessor, roomCode, room);
        if (actor == null) return;

        Player sender = actor.player();
        if (!sender.isAlive()) return;

        String targetId = payload.get("targetId");
        Player target = room.getPlayer(targetId);
        if (target == null || !target.isAlive() || targetId.equals(sender.getId())) return;

        ChatMessage msg = new ChatMessage();
        msg.setSenderId(sender.getId());
        msg.setSenderName(sender.getName());
        msg.setContent(payload.get("content"));

        messagingTemplate.convertAndSend(actor.privateTopic(),
            Map.of("type", "DM", "message", msg, "withId", targetId));

        String targetTopic = identityService.privateTopicForPlayer(targetId);
        if (targetTopic != null) {
            messagingTemplate.convertAndSend(targetTopic,
                Map.of("type", "DM", "message", msg, "withId", sender.getId()));
        }
    }

    @MessageMapping("/room/{roomCode}/gnosia-chat")
    public void handleGnosiaChat(@DestinationVariable String roomCode, @Payload Map<String, String> payload,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) {
            log.warn("[GNOSIA-CHAT] Room {} not found", roomCode);
            return;
        }

        SessionIdentityService.Actor actor = requireActor(headerAccessor, roomCode, room);
        if (actor == null) return;

        Player sender = actor.player();
        if (!sender.isAlive() || sender.getRole() != Role.GNOSIA) {
            log.warn("[GNOSIA-CHAT] Unauthorized attempt by player {}", sender.getId());
            return;
        }

        ChatMessage msg = new ChatMessage();
        msg.setSenderId(sender.getId());
        msg.setSenderName(sender.getName());
        msg.setContent(payload.get("content"));

        room.getPlayers().stream()
                .filter(p -> p.isAlive() && p.getRole() == Role.GNOSIA)
                .forEach(p -> {
                    String topic = identityService.privateTopicForPlayer(p.getId());
                    if (topic != null) {
                        messagingTemplate.convertAndSend(topic,
                            Map.of("type", "GNOSIA_CHAT", "message", msg));
                    }
                });

        log.info("[GNOSIA-CHAT] {} in room {}: {}", sender.getName(), roomCode, payload.get("content"));
    }
}