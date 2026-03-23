package com.im.service;

import org.redisson.api.RMapCache;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.util.concurrent.TimeUnit;

@Component
public class ProcessedMessageDeduplicator {

    private static final String CACHE_NAME = "im:message:processed:cache";
    private final RedissonClient redissonClient;
    private RMapCache<String, Boolean> processedCache;

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
        // If putIfAbsent returns null, the key was not present, so we successfully marked it.
        // We set TTL to 10 minutes to avoid memory leak.
        return processedCache.putIfAbsent(messageIdAndStatus, Boolean.TRUE, 10, TimeUnit.MINUTES) == null;
    }
}

