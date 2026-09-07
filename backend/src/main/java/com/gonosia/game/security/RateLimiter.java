package com.gonosia.game.security;

/**
 * A minimal, backend-agnostic token/rate limiter.
 *
 * <p>This is the seam that separates the application's rate-limiting policy from
 * the storage backend. The default production implementation is an in-memory one
 * ({@link InMemoryRateLimiter}) which is correct for a single instance. Moving to
 * a shared backend (e.g. Redis) later only requires a new implementation of this
 * interface and pointing Spring at it — the controllers and {@link RateLimitService}
 * do not change. Because {@link InMemoryRateLimiter} keeps its counters in local
 * JVM memory, it must be documented that limits are per-instance, not global, when
 * the service runs more than one instance.
 */
public interface RateLimiter {

    /**
     * Try to consume one unit from a fixed window identified by {@code key}.
     *
     * @param key           the bucketed identity (e.g. "session:abc", "ip:1.2.3.4")
     * @param limit         maximum units allowed within the window
     * @param windowMillis  the fixed window length in milliseconds
     * @return true if the unit is within budget, false if the window is exhausted
     */
    boolean tryAcquire(String key, int limit, long windowMillis);

    /**
     * Drop any state held for {@code key}. Used when a session disconnects so a
     * reconnect does not inherit stale counters from the previous connection.
     */
    void clear(String key);

    /**
     * Drop all buckets. Intended for test isolation and administrative reset; a
     * production Redis implementation could simply delete from the keyspace.
     */
    void reset();
}
