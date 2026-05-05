package com.im.ai.security;

import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;

/**
 * Local TTL-based nonce cache for replay attack prevention.
 * Nonce TTL equals the max clock skew window (default 5 minutes).
 */
@Component
public class NonceCache {

    private final ConcurrentHashMap<String, Long> seen = new ConcurrentHashMap<>();
    private volatile long lastCleanup = System.currentTimeMillis();

    private static final long CLEANUP_INTERVAL_MS = 60_000;

    /**
     * Try to claim a nonce. Returns true if the nonce is fresh (not seen within TTL).
     */
    public boolean tryClaim(String nonce, long ttlMs) {
        cleanup(ttlMs);
        long now = System.currentTimeMillis();
        Long prev = seen.putIfAbsent(nonce, now);
        if (prev == null) {
            return true;
        }
        return (now - prev) > ttlMs;
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
