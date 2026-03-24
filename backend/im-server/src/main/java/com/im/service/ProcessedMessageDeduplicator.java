package com.im.service;

import org.redisson.api.RMapCache;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.util.concurrent.TimeUnit;

@Component
public class ProcessedMessageDeduplicator {

    private static final String CACHE_NAME = "im:message:processed:cache";
    private final RedissonClient redissonClient;
    private RMapCache<String, Boolean> processedCache;

    @Value("${im.kafka.idempotency.ttl-ms:600000}")
    private long ttlMs;

    public ProcessedMessageDeduplicator(RedissonClient redissonClient) {
        this.redissonClient = redissonClient;
    }

    @PostConstruct
    public void init() {
        processedCache = redissonClient.getMapCache(CACHE_NAME);
    }

    public boolean tryMarkProcessed(String messageIdAndStatus) {
        if (messageIdAndStatus == null) {
            return false;
        }
        long safeTtlMs = Math.max(1000L, ttlMs);
        return processedCache.putIfAbsent(messageIdAndStatus, Boolean.TRUE, safeTtlMs, TimeUnit.MILLISECONDS) == null;
    }
}

