package com.im.service;

import com.im.dto.MessageDTO;
import lombok.Data;
import org.redisson.api.RBlockingQueue;
import org.redisson.api.RDelayedQueue;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.util.concurrent.TimeUnit;

@Component
public class MessageRetryQueue {

    private static final int MAX_ATTEMPTS = 20;
    private static final String QUEUE_NAME = "im:message:retry:queue";

    private final RedissonClient redissonClient;
    private RBlockingQueue<RetryItem> blockingQueue;
    private RDelayedQueue<RetryItem> delayedQueue;

    public MessageRetryQueue(RedissonClient redissonClient) {
        this.redissonClient = redissonClient;
    }

    @PostConstruct
    public void init() {
        blockingQueue = redissonClient.getBlockingQueue(QUEUE_NAME);
        delayedQueue = redissonClient.getDelayedQueue(blockingQueue);
    }

    public void enqueue(String userId, MessageDTO message, String reason) {
        if (userId == null || userId.isBlank() || message == null) {
            return;
        }
        long nowMs = System.currentTimeMillis();
        RetryItem item = new RetryItem();
        item.setUserId(userId);
        item.setMessage(message);
        item.setAttempts(0);
        item.setCreatedAtMs(nowMs);
        item.setLastError(reason);
        
        delayedQueue.offer(item, 500, TimeUnit.MILLISECONDS);
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
        if (attempts >= MAX_ATTEMPTS) {
            return; // Drop message
        }
        item.setAttempts(attempts);
        item.setLastError(error);
        
        long backoff = calculateBackoffMs(attempts);
        delayedQueue.offer(item, backoff, TimeUnit.MILLISECONDS);
    }

    private long calculateBackoffMs(int attempts) {
        long base = 500L;
        long multiplier = 1L << Math.min(10, Math.max(0, attempts - 1));
        long backoff = base * multiplier;
        return Math.min(backoff, 60_000L);
    }

    @Data
    public static class RetryItem {
        private String userId;
        private MessageDTO message;
        private int attempts;
        private long createdAtMs;
        private String lastError;
    }
}
