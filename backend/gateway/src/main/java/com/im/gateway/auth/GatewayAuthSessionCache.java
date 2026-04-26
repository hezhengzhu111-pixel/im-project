package com.im.gateway.auth;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.im.enums.AuthErrorCode;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

public class GatewayAuthSessionCache {
    private static final int WS_AUTH_CACHE_MAX_SIZE = 10_000;
    private static final Duration WS_AUTH_CACHE_MAX_TTL = Duration.ofSeconds(10);

    private final Cache<String, CachedWebSocketSession> wsAuthResultCache;
    private final ConcurrentHashMap<String, Mono<GatewayAuthSession>> inFlightWsAuthRequests;

    public GatewayAuthSessionCache() {
        this.wsAuthResultCache = Caffeine.newBuilder()
                .maximumSize(WS_AUTH_CACHE_MAX_SIZE)
                .expireAfterWrite(WS_AUTH_CACHE_MAX_TTL)
                .build();
        this.inFlightWsAuthRequests = new ConcurrentHashMap<>();
    }

    public Mono<GatewayAuthSession> authenticateWebSocket(String token,
                                                          boolean cacheEnabled,
                                                          long ttlMs,
                                                          Supplier<Mono<GatewayAuthSession>> loader) {
        String cacheKey = tokenCacheKey(token);
        if (cacheKey == null) {
            return Mono.error(GatewayAuthException.unauthorized(AuthErrorCode.TOKEN_INVALID));
        }
        GatewayAuthSession cachedSession = readCachedWebSocketSession(cacheKey, cacheEnabled, ttlMs);
        if (cachedSession != null) {
            return Mono.just(cachedSession);
        }
        return inFlightWsAuthRequests.computeIfAbsent(cacheKey, ignored -> buildInFlightWebSocketAuthentication(cacheKey, cacheEnabled, ttlMs, loader));
    }

    public long normalizeWebSocketTtlMs(long requestedTtlMs) {
        return Math.max(1L, Math.min(requestedTtlMs, WS_AUTH_CACHE_MAX_TTL.toMillis()));
    }

    private Mono<GatewayAuthSession> buildInFlightWebSocketAuthentication(String cacheKey,
                                                                          boolean cacheEnabled,
                                                                          long ttlMs,
                                                                          Supplier<Mono<GatewayAuthSession>> loader) {
        AtomicReference<Mono<GatewayAuthSession>> inFlightReference = new AtomicReference<>();
        Mono<GatewayAuthSession> inFlight = Mono.defer(() -> {
                    GatewayAuthSession cachedSession = readCachedWebSocketSession(cacheKey, cacheEnabled, ttlMs);
                    if (cachedSession != null) {
                        return Mono.just(cachedSession);
                    }
                    return loader.get()
                            .doOnNext(session -> cacheWebSocketSession(cacheKey, cacheEnabled, session));
                })
                .doFinally(signalType -> inFlightWsAuthRequests.remove(cacheKey, inFlightReference.get()))
                .cache();
        inFlightReference.set(inFlight);
        return inFlight;
    }

    private GatewayAuthSession readCachedWebSocketSession(String cacheKey, boolean cacheEnabled, long ttlMs) {
        if (!cacheEnabled || cacheKey == null) {
            return null;
        }
        CachedWebSocketSession cachedSession = wsAuthResultCache.getIfPresent(cacheKey);
        if (cachedSession == null || cachedSession.isExpired(System.currentTimeMillis(), normalizeWebSocketTtlMs(ttlMs))) {
            wsAuthResultCache.invalidate(cacheKey);
            return null;
        }
        return cachedSession.session();
    }

    private void cacheWebSocketSession(String cacheKey, boolean cacheEnabled, GatewayAuthSession session) {
        if (!cacheEnabled || cacheKey == null || session == null) {
            return;
        }
        Long expiresAtEpochMs = session.expiresAtEpochMs();
        if (expiresAtEpochMs == null || expiresAtEpochMs <= System.currentTimeMillis()) {
            return;
        }
        wsAuthResultCache.put(cacheKey, new CachedWebSocketSession(session, System.currentTimeMillis(), expiresAtEpochMs));
    }

    private String tokenCacheKey(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.trim().getBytes(StandardCharsets.UTF_8));
            StringBuilder key = new StringBuilder();
            for (byte b : digest) {
                key.append(String.format("%02x", b));
            }
            return key.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private record CachedWebSocketSession(GatewayAuthSession session, long cachedAtEpochMs, long expiresAtEpochMs) {
        private boolean isExpired(long nowEpochMs, long ttlMs) {
            return expiresAtEpochMs <= nowEpochMs || cachedAtEpochMs + ttlMs <= nowEpochMs;
        }
    }
}
