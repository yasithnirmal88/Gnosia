package com.gonosia.game.controller;

import com.gonosia.game.model.*;
import com.gonosia.game.service.RoomManager;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import java.util.Map;

@Controller
public class ChatController {

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

        Phase currentPhase = room.getGameState().getPhase();
        Player sender = room.getPlayer(message.getSenderId());
        if (sender == null || !sender.isAlive()) return;

        if (currentPhase == Phase.WARP) {
            // Only Gnosia can chat in Warp
            if (sender.getRole() == Role.GNOSIA) {
                // Broadcast to each Gnosia privately
                room.getPlayers().stream()
                        .filter(p -> p.getRole() == Role.GNOSIA)
                        .forEach(p -> {
                            messagingTemplate.convertAndSendToUser(p.getId(), "/queue/private", 
                                Map.of("type", "WARP_CHAT", "message", message));
                        });
            }
        } else if (currentPhase == Phase.DISCUSSION || currentPhase == Phase.LOBBY) {
            // Public chat
            messagingTemplate.convertAndSend("/topic/room/" + roomCode + "/chat", message);
        }
    }
}
