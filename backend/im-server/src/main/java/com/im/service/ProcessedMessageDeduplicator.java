package com.im.service;

import jakarta.annotation.PostConstruct;
import org.redisson.api.RMapCache;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Component
public class ProcessedMessageDeduplicator {

    private static final String CACHE_NAME = "im:message:processed:cache";
    private static final String RESERVED_VALUE = "RESERVED";
    private final RedissonClient redissonClient;
    private RMapCache<String, String> processedCache;

    @Value("${im.ws.idempotency.ttl-ms:300000}")
    private long ttlMs;

    public ProcessedMessageDeduplicator(RedissonClient redissonClient) {
        this.redissonClient = redissonClient;
    }

    @PostConstruct
    public void init() {
        processedCache = redissonClient.getMapCache(CACHE_NAME);
    }

    public boolean isProcessed(String messageIdAndStatus) {
        if (messageIdAndStatus == null) {
            return false;
        }
        return processedCache.containsKey(messageIdAndStatus);
    }

    public boolean tryReserve(String messageIdAndStatus) {
        if (messageIdAndStatus == null) {
            return false;
        }
        return processedCache.putIfAbsent(messageIdAndStatus, RESERVED_VALUE, safeTtlMs(), TimeUnit.MILLISECONDS) == null;
    }

    public boolean markProcessed(String messageIdAndStatus) {
        return tryReserve(messageIdAndStatus);
    }

    public boolean release(String messageIdAndStatus) {
        if (messageIdAndStatus == null) {
            return false;
        }
        return processedCache.remove(messageIdAndStatus, RESERVED_VALUE);
    }

    private long safeTtlMs() {
        return Math.max(1000L, ttlMs);
    }
}

