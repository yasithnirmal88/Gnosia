package com.gonosia.game.controller;

import com.gonosia.game.model.*;
import com.gonosia.game.security.RateLimitService;
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

    static final int MAX_MESSAGE_LENGTH = 500;
    static final int MAX_MESSAGE_BYTES = 2048;

    private final SimpMessagingTemplate messagingTemplate;
    private final RoomManager roomManager;
    private final SessionIdentityService identityService;
    private final RateLimitService rateLimitService;

    public ChatController(SimpMessagingTemplate messagingTemplate, RoomManager roomManager,
            SessionIdentityService identityService, RateLimitService rateLimitService) {
        this.messagingTemplate = messagingTemplate;
        this.roomManager = roomManager;
        this.identityService = identityService;
        this.rateLimitService = rateLimitService;
    }

    private SessionIdentityService.Actor requireRoomMembership(SimpMessageHeaderAccessor headerAccessor, String roomCode, Room room) {
        String sessionId = headerAccessor != null ? headerAccessor.getSessionId() : null;
        return identityService.requireRoomMembership(sessionId, room);
    }

    private String sessionIdOf(SimpMessageHeaderAccessor headerAccessor) {
        return headerAccessor != null ? headerAccessor.getSessionId() : null;
    }

    // ─── Shared validation ──────────────────────────────────────────────────
    // Sender status and message size are validated for every communication
    // channel. The sender identity is always derived from the authenticated
    // session (via Actor), never from the payload.

    private Player requireLiveSender(Room room, SessionIdentityService.Actor actor, String channel) {
        if (room.getGameState() == null || room.getGameState().getPhase() == Phase.GAME_OVER) {
            log.warn("[{}] {} rejected: game over", channel, actor.player().getId());
            return null;
        }
        Player sender = actor.player();
        if (!sender.isAlive() || sender.isCryoslept()) {
            log.warn("[{}] {} rejected: not a live member", channel, sender.getId());
            return null;
        }
        return sender;
    }

    private boolean isOversized(String content) {
        if (content == null) return true;
        int length = content.length();
        int bytes;
        try {
            bytes = content.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
        } catch (Exception e) {
            return true;
        }
        return length == 0 || length > MAX_MESSAGE_LENGTH || bytes > MAX_MESSAGE_BYTES;
    }

    // ─── Public room chat ───────────────────────────────────────────────────
    // Sender derived from session. Message length/size enforced. Sender must be
    // a live member. Gnosia-only chatter lives in its own endpoint; the public
    // room chat envelope carries no client-trustable channel flag.
    @MessageMapping("/room/{roomCode}/chat")
    public void handleChat(@DestinationVariable String roomCode, @Payload ChatMessage message,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        if (actor == null) return;

        Player sender = requireLiveSender(room, actor, "CHAT");
        if (sender == null) return;

        if (!rateLimitService.allowChat(sessionIdOf(headerAccessor), sender.getId(), roomCode)) {
            log.warn("[CHAT] {} rejected: rate limited", sender.getId());
            return;
        }

        String content = message != null ? message.getContent() : null;
        if (isOversized(content)) {
            log.warn("[CHAT] {} rejected: oversized/empty message", sender.getId());
            return;
        }

        ChatMessage msg = new ChatMessage();
        msg.setSenderId(sender.getId());
        msg.setSenderName(sender.getName());
        msg.setContent(content);

        messagingTemplate.convertAndSend("/topic/room/" + roomCode + "/chat", msg);
    }

    // ─── Direct message ─────────────────────────────────────────────────────
    // Sender = authenticated session player (never senderId from payload).
    // Target must exist in the SAME room, be alive, not cryoslept, and not the
    // sender. Routing to the recipient is always server-side via the secret
    // private topic bound to the target's identity — a spoofed targetId cannot
    // redirect delivery because it is resolved in-room and ignored otherwise.
    @MessageMapping("/room/{roomCode}/dm")
    public void handleDm(@DestinationVariable String roomCode, @Payload Map<String, String> payload,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) return;

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        if (actor == null) return;

        Player sender = requireLiveSender(room, actor, "DM");
        if (sender == null) return;

        if (!rateLimitService.allowDm(sessionIdOf(headerAccessor), sender.getId(), roomCode)) {
            log.warn("[DM] {} rejected: rate limited", sender.getId());
            return;
        }

        String content = payload != null ? payload.get("content") : null;
        if (isOversized(content)) {
            log.warn("[DM] {} rejected: oversized/empty message", sender.getId());
            return;
        }

        String targetId = payload.get("targetId");
        Player target = room.getPlayer(targetId);
        if (target == null || target == sender || !target.isAlive() || target.isCryoslept()) {
            log.warn("[DM] {} rejected: invalid/illegible target {}", sender.getId(), targetId);
            return;
        }

        // A Gnosia-only "whisper" is not a server concept here; DMs are 1:1.

        ChatMessage msg = new ChatMessage();
        msg.setSenderId(sender.getId());
        msg.setSenderName(sender.getName());
        msg.setContent(content);

        // Echo to the sender's private channel (so their own UI can render it).
        String myTopic = identityService.privateTopicForPlayer(sender.getId());
        if (myTopic != null) {
            messagingTemplate.convertAndSend(myTopic,
                Map.of("type", "DM", "message", msg, "withId", targetId));
        }

        // Deliver to the recipient's private channel. The topic is derived from
        // the recipient's secret channel key, never from the payload.
        String targetTopic = identityService.privateTopicForPlayer(targetId);
        if (targetTopic != null) {
            messagingTemplate.convertAndSend(targetTopic,
                Map.of("type", "DM", "message", msg, "withId", sender.getId()));
        }
    }

    // ─── Gnosia-only channel ────────────────────────────────────────────────
    // Server determines whether the sender is actually Gnosia from the assigned
    // role on the Player model — role/team/isGnosia fields from the payload are
    // ignored entirely.
    @MessageMapping("/room/{roomCode}/gnosia-chat")
    public void handleGnosiaChat(@DestinationVariable String roomCode, @Payload Map<String, String> payload,
            SimpMessageHeaderAccessor headerAccessor) {
        Room room = roomManager.getRoom(roomCode);
        if (room == null) {
            log.warn("[GNOSIA-CHAT] Room {} not found", roomCode);
            return;
        }

        SessionIdentityService.Actor actor = requireRoomMembership(headerAccessor, roomCode, room);
        if (actor == null) return;

        Player sender = requireLiveSender(room, actor, "GNOSIA-CHAT");
        if (sender == null) return;

        if (sender.getRole() != Role.GNOSIA) {
            log.warn("[GNOSIA-CHAT] Unauthorized attempt by player {}", sender.getId());
            return;
        }

        if (!rateLimitService.allowGnosiaChat(sessionIdOf(headerAccessor), sender.getId(), roomCode)) {
            log.warn("[GNOSIA-CHAT] {} rejected: rate limited", sender.getId());
            return;
        }

        String content = payload != null ? payload.get("content") : null;
        if (isOversized(content)) {
            log.warn("[GNOSIA-CHAT] {} rejected: oversized/empty message", sender.getId());
            return;
        }

        ChatMessage msg = new ChatMessage();
        msg.setSenderId(sender.getId());
        msg.setSenderName(sender.getName());
        msg.setContent(content);

        room.getPlayers().stream()
                .filter(p -> p.isAlive() && !p.isCryoslept() && p.getRole() == Role.GNOSIA)
                .forEach(p -> {
                    String topic = identityService.privateTopicForPlayer(p.getId());
                    if (topic != null) {
                        messagingTemplate.convertAndSend(topic,
                            Map.of("type", "GNOSIA_CHAT", "message", msg));
                    }
                });

        // Deliberately no message content in the log line — gnosia chat is private
        // between wolves and must never land in server logs.
        log.info("[GNOSIA-CHAT] {} in room {} sent a message", sender.getName(), roomCode);
    }
}
