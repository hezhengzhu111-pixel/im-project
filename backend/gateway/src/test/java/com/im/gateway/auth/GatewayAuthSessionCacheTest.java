package com.im.gateway.auth;

import com.im.dto.AuthUserResourceDTO;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;

import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GatewayAuthSessionCacheTest {

    @Test
    void authenticateWebSocket_ShouldCacheSuccessfulSession() {
        GatewayAuthSessionCache cache = new GatewayAuthSessionCache();
        AtomicInteger calls = new AtomicInteger();

        GatewayAuthSession first = cache.authenticateWebSocket(
                "token",
                true,
                5000,
                () -> {
                    calls.incrementAndGet();
                    return Mono.just(session(System.currentTimeMillis() + 60_000L));
                }
        ).block();
        GatewayAuthSession second = cache.authenticateWebSocket(
                "token",
                true,
                5000,
                () -> {
                    calls.incrementAndGet();
                    return Mono.just(session(System.currentTimeMillis() + 60_000L));
                }
        ).block();

        assertEquals(1, calls.get());
        assertEquals(first, second);
    }

    @Test
    void authenticateWebSocket_ShouldNotCacheWhenDisabled() {
        GatewayAuthSessionCache cache = new GatewayAuthSessionCache();
        AtomicInteger calls = new AtomicInteger();

        cache.authenticateWebSocket("token", false, 5000, () -> {
            calls.incrementAndGet();
            return Mono.just(session(System.currentTimeMillis() + 60_000L));
        }).block();
        cache.authenticateWebSocket("token", false, 5000, () -> {
            calls.incrementAndGet();
            return Mono.just(session(System.currentTimeMillis() + 60_000L));
        }).block();

        assertEquals(2, calls.get());
    }

    private GatewayAuthSession session(long expiresAtEpochMs) {
        return new GatewayAuthSession(7L, "alice", resource(7L, "alice"), expiresAtEpochMs);
    }

    private AuthUserResourceDTO resource(Long userId, String username) {
        AuthUserResourceDTO resource = new AuthUserResourceDTO();
        resource.setUserId(userId);
        resource.setUsername(username);
        return resource;
    }
}
