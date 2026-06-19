package com.im.ai.security;

import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;

/**
 * Local TTL-based nonce cache for replay attack prevention.
 * Nonce TTL equals the max clock skew window (default 5 minutes).
 *
 * Note: This is a local in-memory cache. Multi-instance deployments
 * should use a distributed cache (e.g. Redis SET NX PX) to prevent
 * cross-instance replay attacks.
 */
@Component
public class NonceCache {

    private final ConcurrentHashMap<String, Long> seen = new ConcurrentHashMap<>();
    private volatile long lastCleanup = System.currentTimeMillis();

    private static final long CLEANUP_INTERVAL_MS = 60_000;

    /**
     * Try to claim a nonce. Returns true if the nonce is fresh (not seen within TTL).
     * When an expired nonce is reclaimed, its timestamp is atomically updated to
     * prevent immediate reuse within the same TTL window.
     */
    public boolean tryClaim(String nonce, long ttlMs) {
        cleanup(ttlMs);
        long now = System.currentTimeMillis();
        Long prev = seen.putIfAbsent(nonce, now);
        if (prev == null) {
            return true;
        }
        if ((now - prev) > ttlMs) {
            // Nonce expired — atomically replace with fresh timestamp
            boolean reclaimed = seen.compute(nonce, (key, existing) -> {
                if (existing == null || (now - existing) > ttlMs) {
                    return now;
                }
                return existing;
            }) == now;
            return reclaimed;
        }
        return false;
    }

    private void cleanup(long ttlMs) {
        long now = System.currentTimeMillis();
        if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
            return;
        }
        lastCleanup = now;
        seen.entrySet().removeIf(e -> (now - e.getValue()) > ttlMs);
    }
}
