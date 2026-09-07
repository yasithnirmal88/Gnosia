package com.gonosia.game.service;

import com.gonosia.game.model.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class TimerService {
    private static final Logger log = LoggerFactory.getLogger(TimerService.class);

    private final RoomManager roomManager;
    private final GameService gameService;

    public TimerService(RoomManager roomManager, GameService gameService) {
        this.roomManager = roomManager;
        this.gameService = gameService;
    }

    @Scheduled(fixedRate = 1000)
    public void tick() {
        try {
            for (Room room : roomManager.getAllRooms().values()) {
                GameState state = room.getGameState();
                if (state == null || state.getPhase() == Phase.LOBBY || state.getPhase() == Phase.GAME_OVER) continue;

                if (state.getRemainingTimeSeconds() > 0) {
                    state.setRemainingTimeSeconds(state.getRemainingTimeSeconds() - 1);
                    // Lightweight countdown only — the full game state is broadcast on
                    // real events (join/leave, phase transition, vote, action, etc.).
                    gameService.broadcastTimerUpdate(room);
                } else {
                    // Phase transitions remain entirely server-authoritative: they are
                    // triggered only by the server tick and always broadcast full state.
                    gameService.transitionPhase(room);
                }
            }
        } catch (Exception e) {
            log.error("[TIMER] Critical error in game tick: {}", e.getMessage(), e);
        }
    }
}
