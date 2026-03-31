package com.im.service;

import com.im.dto.WsPushEvent;
import lombok.Data;
import org.redisson.api.RBlockingQueue;
import org.redisson.api.RDelayedQueue;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.util.concurrent.TimeUnit;

@Component
public class MessageRetryQueue {

    private static final String QUEUE_NAME = "im:message:retry:queue";

    private final RedissonClient redissonClient;
    private RBlockingQueue<RetryItem> blockingQueue;
    private RDelayedQueue<RetryItem> delayedQueue;

    @Value("${im.ws.retry.max-attempts:20}")
    private int maxAttempts;

    @Value("${im.ws.retry.base-backoff-ms:500}")
    private long baseBackoffMs;

    public MessageRetryQueue(RedissonClient redissonClient) {
        this.redissonClient = redissonClient;
    }

    @PostConstruct
    public void init() {
        blockingQueue = redissonClient.getBlockingQueue(QUEUE_NAME);
        delayedQueue = redissonClient.getDelayedQueue(blockingQueue);
    }

    public void enqueue(String userId, WsPushEvent event, String reason) {
        if (userId == null || userId.isBlank() || event == null) {
            return;
        }
        RetryItem item = new RetryItem();
        item.setUserId(userId);
        item.setEvent(event);
        item.setAttempts(0);
        item.setCreatedAtMs(System.currentTimeMillis());
        item.setLastError(reason);
        delayedQueue.offer(item, Math.max(100L, baseBackoffMs), TimeUnit.MILLISECONDS);
    }

    public RetryItem pollReady() {
        try {
            return blockingQueue.poll(1, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    public void requeue(RetryItem item, String error) {
        if (item == null || item.getUserId() == null) {
            return;
        }
        int attempts = item.getAttempts() + 1;
        if (attempts >= Math.max(1, maxAttempts)) {
            return;
        }
        item.setAttempts(attempts);
        item.setLastError(error);
        delayedQueue.offer(item, calculateBackoffMs(attempts), TimeUnit.MILLISECONDS);
    }

    private long calculateBackoffMs(int attempts) {
        long multiplier = 1L << Math.min(10, Math.max(0, attempts - 1));
        return Math.min(Math.max(100L, baseBackoffMs) * multiplier, 60_000L);
    }

    @Data
    public static class RetryItem {
        private String userId;
        private WsPushEvent event;
        private int attempts;
        private long createdAtMs;
        private String lastError;
    }
}
