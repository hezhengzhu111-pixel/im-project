package com.im.service;

import com.im.dto.MessageDTO;
import lombok.Data;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class MessageRetryQueue {

    private static final int MAX_QUEUE_SIZE_PER_USER = 200;
    private static final int MAX_ATTEMPTS = 20;

    private final Map<String, Deque<RetryItem>> queues = new ConcurrentHashMap<>();

    public void enqueue(String userId, MessageDTO message, String reason) {
        if (userId == null || userId.isBlank() || message == null) {
            return;
        }
        long nowMs = System.currentTimeMillis();
        Deque<RetryItem> queue = queues.computeIfAbsent(userId, k -> new ArrayDeque<>());
        synchronized (queue) {
            while (queue.size() >= MAX_QUEUE_SIZE_PER_USER) {
                queue.pollFirst();
            }
            RetryItem item = new RetryItem();
            item.setUserId(userId);
            item.setMessage(message);
            item.setAttempts(0);
            item.setCreatedAtMs(nowMs);
            item.setNextRetryAtMs(nowMs);
            item.setLastError(reason);
            queue.addLast(item);
        }
    }

    public RetryItem pollReady(String userId) {
        if (userId == null || userId.isBlank()) {
            return null;
        }
        Deque<RetryItem> queue = queues.get(userId);
        if (queue == null) {
            return null;
        }
        long nowMs = System.currentTimeMillis();
        synchronized (queue) {
            RetryItem head = queue.peekFirst();
            if (head == null) {
                return null;
            }
            if (head.getAttempts() >= MAX_ATTEMPTS) {
                queue.pollFirst();
                return null;
            }
            if (head.getNextRetryAtMs() > nowMs) {
                return null;
            }
            return queue.pollFirst();
        }
    }

    public void requeue(RetryItem item, String error) {
        if (item == null || item.getUserId() == null) {
            return;
        }
        String userId = item.getUserId();
        Deque<RetryItem> queue = queues.computeIfAbsent(userId, k -> new ArrayDeque<>());
        synchronized (queue) {
            int attempts = item.getAttempts() + 1;
            item.setAttempts(attempts);
            item.setLastError(error);
            item.setNextRetryAtMs(System.currentTimeMillis() + calculateBackoffMs(attempts));
            queue.addFirst(item);
        }
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
        private long nextRetryAtMs;
        private String lastError;
    }
}
