package com.im.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class ProcessedMessageDeduplicator {

    private final Map<String, Long> processedAtMs = new ConcurrentHashMap<>();

    private final long ttlMs;

    public ProcessedMessageDeduplicator(
            @Value("${im.kafka.idempotency.ttl-ms:600000}") long ttlMs) {
        this.ttlMs = Math.max(1_000, ttlMs);
    }

    public boolean tryMarkProcessed(String messageId) {
        if (messageId == null || messageId.isBlank()) {
            return true;
        }
        long now = System.currentTimeMillis();
        Long existing = processedAtMs.putIfAbsent(messageId, now);
        if (existing == null) {
            return true;
        }
        if (now - existing > ttlMs) {
            processedAtMs.put(messageId, now);
            return true;
        }
        return false;
    }

    @Scheduled(fixedDelayString = "${im.kafka.idempotency.cleanup-interval-ms:60000}")
    public void cleanup() {
        long now = System.currentTimeMillis();
        for (Map.Entry<String, Long> entry : processedAtMs.entrySet()) {
            if (entry.getValue() == null) {
                processedAtMs.remove(entry.getKey());
                continue;
            }
            if (now - entry.getValue() > ttlMs) {
                processedAtMs.remove(entry.getKey());
            }
        }
    }
}

