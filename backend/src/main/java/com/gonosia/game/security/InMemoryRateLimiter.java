package com.gonosia.game.security;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Default in-memory {@link RateLimiter}: a fixed-window counter per key, kept in
 * local JVM memory. Cheap and correct for a single application instance.
 *
 * <p><strong>Multi-instance limitation:</strong> counters live in the heap of the
 * local JVM only. When more than one application instance serves traffic, an
 * attacker can effectively multiply their budget by spreading requests across
 * instances (each instance allows {@code limit} per window). For strict, global
 * enforcement a shared-backend implementation (Redis) is required. In-memory is
 * therefore best understood as per-instance abuse protection — which still stops a
 * single client from hammering the one instance it is connected to.
 *
 * <p>This implementation is unbounded in the number of keys it retains; stale keys
 * from long-lived attacker sessions could accumulate. Callers are expected to
 * {@link #clear(String)} on session disconnect. A production Redis backend would
 * naturally expire keys instead.
 */
@Component
public class InMemoryRateLimiter implements RateLimiter {

    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    @Override
    public boolean tryAcquire(String key, int limit, long windowMillis) {
        long now = System.currentTimeMillis();
        Window window = windows.computeIfAbsent(key, k -> new Window(now));
        synchronized (window) {
            if (window.windowStart + windowMillis <= now) {
                window.windowStart = now;
                window.count = 0;
            }
            if (window.count >= limit) {
                return false;
            }
            window.count++;
            return true;
        }
    }

    @Override
    public void clear(String key) {
        windows.remove(key);
    }

    @Override
    public void reset() {
        windows.clear();
    }

    private static final class Window {
        volatile long windowStart;
        volatile int count;

        Window(long windowStart) {
            this.windowStart = windowStart;
        }
    }
}
