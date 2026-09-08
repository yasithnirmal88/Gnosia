package com.gonosia.game.config;

import java.util.List;

/** Explicit, validated list of browser origins allowed to connect (WS handshake + SockJS). */
public record AllowedOrigins(List<String> values) {

    public boolean isEmpty() {
        return values == null || values.isEmpty();
    }
}