package com.im.service;

import com.im.config.ImNodeIdentity;
import com.im.dto.WsPushEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RBlockingQueue;
import org.redisson.api.RDelayedQueue;
import org.redisson.api.RedissonClient;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageRetryQueueTest {

    @Mock
    private RedissonClient redissonClient;

    @Mock
    private ImNodeIdentity nodeIdentity;

    @Mock
    private RBlockingQueue<MessageRetryQueue.RetryItem> blockingQueue;

    @Mock
    private RDelayedQueue<MessageRetryQueue.RetryItem> delayedQueue;

    private MessageRetryQueue retryQueue;

    @BeforeEach
    void setUp() {
        retryQueue = new MessageRetryQueue(redissonClient, nodeIdentity);
        ReflectionTestUtils.setField(retryQueue, "baseBackoffMs", 500L);
        ReflectionTestUtils.setField(retryQueue, "maxAttempts", 20);
        ReflectionTestUtils.setField(retryQueue, "retryItemExpireMs", 60000L);
        when(nodeIdentity.getInstanceId()).thenReturn("im-node-1");
        when(redissonClient.<MessageRetryQueue.RetryItem>getBlockingQueue("im:message:retry:queue:im-node-1"))
                .thenReturn(blockingQueue);
        when(redissonClient.getDelayedQueue(blockingQueue)).thenReturn(delayedQueue);
        retryQueue.init();
    }

    @Test
    void enqueue_shouldWriteInstanceScopedRetryItem() {
        WsPushEvent event = WsPushEvent.builder().eventId("evt-1").eventType("MESSAGE").build();

        retryQueue.enqueue("user1", "session-1", event, "reason");

        ArgumentCaptor<MessageRetryQueue.RetryItem> captor = ArgumentCaptor.forClass(MessageRetryQueue.RetryItem.class);
        verify(delayedQueue).offer(captor.capture(), eq(500L), eq(TimeUnit.MILLISECONDS));
        MessageRetryQueue.RetryItem item = captor.getValue();
        assertEquals("user1", item.getUserId());
        assertEquals("session-1", item.getSessionId());
        assertEquals("im-node-1", item.getInstanceId());
        assertEquals(event, item.getEvent());
        assertEquals("reason", item.getLastError());
        assertTrue(item.getExpireAtMs() > item.getCreatedAtMs());
    }

    @Test
    void requeue_shouldIncrementAttemptsUntilExpiry() {
        MessageRetryQueue.RetryItem item = new MessageRetryQueue.RetryItem();
        item.setUserId("user1");
        item.setSessionId("session-1");
        item.setAttempts(0);
        item.setExpireAtMs(System.currentTimeMillis() + 60000L);

        retryQueue.requeue(item, "error2");

        assertEquals(1, item.getAttempts());
        assertEquals("error2", item.getLastError());
        verify(delayedQueue).offer(item, 500L, TimeUnit.MILLISECONDS);
    }

    @Test
    void requeue_shouldDropExpiredItem() {
        MessageRetryQueue.RetryItem item = new MessageRetryQueue.RetryItem();
        item.setUserId("user1");
        item.setSessionId("session-1");
        item.setExpireAtMs(System.currentTimeMillis() - 1);

        retryQueue.requeue(item, "expired");

        assertTrue(retryQueue.isExpired(item));
        verify(delayedQueue, never()).offer(any(), anyLong(), any());
    }

    @Test
    void getBlockingQueueForInstance_shouldUseInstanceScopedQueueName() {
        retryQueue.getBlockingQueueForInstance("node-b");

        verify(redissonClient).getBlockingQueue("im:message:retry:queue:node-b");
        assertEquals("im:message:retry:queue:node-b", MessageRetryQueue.buildQueueName("node-b"));
    }
}
