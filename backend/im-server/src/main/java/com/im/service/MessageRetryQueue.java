package com.im.service;

import com.im.config.ImNodeIdentity;
import com.im.dto.WsPushEvent;
import jakarta.annotation.PostConstruct;
import lombok.Data;
import org.redisson.api.RBlockingQueue;
import org.redisson.api.RDelayedQueue;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Component
public class MessageRetryQueue {

    public static final String QUEUE_NAME_PREFIX = "im:message:retry:queue:";

    private final RedissonClient redissonClient;
    private final ImNodeIdentity nodeIdentity;
    private RBlockingQueue<RetryItem> blockingQueue;
    private RDelayedQueue<RetryItem> delayedQueue;
    private String queueName;

    @Value("${im.ws.retry.max-attempts:20}")
    private int maxAttempts;

    @Value("${im.ws.retry.base-backoff-ms:500}")
    private long baseBackoffMs;

    @Value("${im.retry.item-expire-ms:60000}")
    private long retryItemExpireMs;

    public MessageRetryQueue(RedissonClient redissonClient, ImNodeIdentity nodeIdentity) {
        this.redissonClient = redissonClient;
        this.nodeIdentity = nodeIdentity;
    }

    @PostConstruct
    public void init() {
        queueName = buildQueueName(nodeIdentity.getInstanceId());
        blockingQueue = redissonClient.getBlockingQueue(queueName);
        delayedQueue = redissonClient.getDelayedQueue(blockingQueue);
    }

    public void enqueue(String userId, String sessionId, WsPushEvent event, String reason) {
        if (userId == null || userId.isBlank() || sessionId == null || sessionId.isBlank() || event == null) {
            return;
        }
        RetryItem item = new RetryItem();
        item.setUserId(userId);
        item.setSessionId(sessionId);
        item.setInstanceId(nodeIdentity.getInstanceId());
        item.setEvent(event);
        item.setAttempts(0);
        item.setCreatedAtMs(System.currentTimeMillis());
        item.setExpireAtMs(System.currentTimeMillis() + Math.max(1000L, retryItemExpireMs));
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
        if (item == null || item.getUserId() == null || item.getSessionId() == null || isExpired(item)) {
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

    public boolean isExpired(RetryItem item) {
        return item == null
                || item.getExpireAtMs() <= 0
                || item.getExpireAtMs() <= System.currentTimeMillis();
    }

    public RBlockingQueue<RetryItem> getBlockingQueueForInstance(String instanceId) {
        return redissonClient.getBlockingQueue(buildQueueName(instanceId));
    }

    public RDelayedQueue<RetryItem> getDelayedQueueForInstance(String instanceId) {
        return redissonClient.getDelayedQueue(getBlockingQueueForInstance(instanceId));
    }

    public String getQueueName() {
        return queueName;
    }

    public static String buildQueueName(String instanceId) {
        return QUEUE_NAME_PREFIX + instanceId;
    }

    private long calculateBackoffMs(int attempts) {
        long multiplier = 1L << Math.min(10, Math.max(0, attempts - 1));
        return Math.min(Math.max(100L, baseBackoffMs) * multiplier, 60_000L);
    }

    @Data
    public static class RetryItem {
        private String userId;
        private String sessionId;
        private String instanceId;
        private WsPushEvent event;
        private int attempts;
        private long createdAtMs;
        private long expireAtMs;
        private String lastError;
    }
}
