package com.gonosia.game.security;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Server-side per-session rate limiter used to prevent signaling spam and other
 * outbound-request floods. For a sliding one-second window, a session may emit
 * at most a fixed number of events; beyond that the burst is dropped.
 */
@Component
public class SignalingRateLimiter {

    private static final int MAX_PER_SECOND = 30;

    private static final long WINDOW_MS = 1000L;

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    /** @return true if the event should be allowed (within budget), false to drop. */
    public boolean allow(String sessionId) {
        long now = System.currentTimeMillis();
        Bucket bucket = buckets.computeIfAbsent(sessionId, id -> new Bucket(now));
        synchronized (bucket) {
            if (now - bucket.windowStart >= WINDOW_MS) {
                bucket.windowStart = now;
                bucket.count.set(0);
            }
            return bucket.count.incrementAndGet() <= MAX_PER_SECOND;
        }
    }

    public void clear(String sessionId) {
        buckets.remove(sessionId);
    }

    private static final class Bucket {
        volatile long windowStart;
        final AtomicInteger count = new AtomicInteger();

        Bucket(long windowStart) {
            this.windowStart = windowStart;
        }
    }
}
