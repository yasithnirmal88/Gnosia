package com.gonosia.game.controller;

import com.gonosia.game.model.*;
import com.gonosia.game.service.RoomManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import java.util.Map;

@Controller
public class ChatController {
    private static final Logger log = LoggerFactory.getLogger(ChatController.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final RoomManager roomManager;

    public ChatController(SimpMessagingTemplate messagingTemplate, RoomManager roomManager) {
        this.messagingTemplate = messagingTemplate;
        this.roomManager = roomManager;
    }

    @MessageMapping("/room/{roomCode}/chat")
    public void handleChat(@DestinationVariable String roomCode, @Payload ChatMessage message) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        Player sender = room.getPlayer(message.getSenderId());
        if (sender == null || !sender.isAlive()) return;

        // Public chat
        messagingTemplate.convertAndSend("/topic/room/" + roomCode + "/chat", message);
    }

    @MessageMapping("/room/{roomCode}/dm")
    public void handleDm(@DestinationVariable String roomCode, @Payload Map<String, String> payload) {
        String senderId = payload.get("senderId");
        String targetId = payload.get("targetId");
        String content = payload.get("content");
        
        ChatMessage msg = new ChatMessage();
        msg.setSenderId(senderId);
        msg.setContent(content);
        
        // Forward to BOTH sender and recipient using explicit topics (matches client subscription)
        messagingTemplate.convertAndSend("/topic/user/" + senderId + "/private",
            Map.of("type", "DM", "message", msg, "withId", targetId));

        messagingTemplate.convertAndSend("/topic/user/" + targetId + "/private",
            Map.of("type", "DM", "message", msg, "withId", senderId));
    }

    @MessageMapping("/room/{roomCode}/gnosia-chat")
    public void handleGnosiaChat(@DestinationVariable String roomCode, @Payload Map<String, String> payload) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) {
            log.warn("[GNOSIA-CHAT] Room {} not found", roomCode);
            return;
        }

        String senderId = payload.get("senderId");
        String content = payload.get("content");
        Player sender = room.getPlayer(senderId);

        if (sender == null || !sender.isAlive() || sender.getRole() != Role.GNOSIA) {
            log.warn("[GNOSIA-CHAT] Unauthorized attempt by player {}", senderId);
            return;
        }

        ChatMessage msg = new ChatMessage();
        msg.setSenderId(senderId);
        msg.setSenderName(sender.getName());
        msg.setContent(content);

        // Broadcast to all alive Gnosia only
        room.getPlayers().stream()
                .filter(p -> p.isAlive() && p.getRole() == Role.GNOSIA)
                .forEach(p -> messagingTemplate.convertAndSend("/topic/user/" + p.getId() + "/private",
                    Map.of("type", "GNOSIA_CHAT", "message", msg)));

        log.info("[GNOSIA-CHAT] {} in room {}: {}", sender.getName(), roomCode, content);
    }
}
