package com.im.service;

import com.im.dto.WsPushEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RBlockingQueue;
import org.redisson.api.RDelayedQueue;
import org.redisson.api.RedissonClient;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageRetryQueueTest {

    @Mock
    private RedissonClient redissonClient;

    @Mock
    private RBlockingQueue<MessageRetryQueue.RetryItem> blockingQueue;

    @Mock
    private RDelayedQueue<MessageRetryQueue.RetryItem> delayedQueue;

    @InjectMocks
    private MessageRetryQueue retryQueue;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(retryQueue, "baseBackoffMs", 500L);
        ReflectionTestUtils.setField(retryQueue, "maxAttempts", 20);
        when(redissonClient.<MessageRetryQueue.RetryItem>getBlockingQueue("im:message:retry:queue")).thenReturn(blockingQueue);
        when(redissonClient.getDelayedQueue(blockingQueue)).thenReturn(delayedQueue);
        retryQueue.init();
    }

    @Test
    void enqueue_ValidInput_ShouldOfferToDelayedQueue() {
        WsPushEvent event = WsPushEvent.builder().eventId("evt-1").eventType("MESSAGE").build();
        
        retryQueue.enqueue("user1", event, "reason");
        
        ArgumentCaptor<MessageRetryQueue.RetryItem> itemCaptor = ArgumentCaptor.forClass(MessageRetryQueue.RetryItem.class);
        verify(delayedQueue).offer(itemCaptor.capture(), eq(500L), eq(TimeUnit.MILLISECONDS));
        
        MessageRetryQueue.RetryItem item = itemCaptor.getValue();
        assertEquals("user1", item.getUserId());
        assertEquals(event, item.getEvent());
        assertEquals(0, item.getAttempts());
        assertEquals("reason", item.getLastError());
    }

    @Test
    void enqueue_InvalidInput_ShouldReturn() {
        retryQueue.enqueue(null, WsPushEvent.builder().eventId("evt-2").build(), "reason");
        retryQueue.enqueue(" ", WsPushEvent.builder().eventId("evt-3").build(), "reason");
        retryQueue.enqueue("user1", null, "reason");
        
        verify(delayedQueue, never()).offer(any(), anyLong(), any());
    }

    @Test
    void pollReady_ShouldPollBlockingQueue() throws InterruptedException {
        MessageRetryQueue.RetryItem mockItem = new MessageRetryQueue.RetryItem();
        when(blockingQueue.poll(1, TimeUnit.SECONDS)).thenReturn(mockItem);
        
        MessageRetryQueue.RetryItem result = retryQueue.pollReady();
        
        assertEquals(mockItem, result);
    }

    @Test
    void pollReady_Interrupted_ShouldReturnNull() throws InterruptedException {
        when(blockingQueue.poll(1, TimeUnit.SECONDS)).thenThrow(new InterruptedException());
        
        MessageRetryQueue.RetryItem result = retryQueue.pollReady();
        
        assertNull(result);
        assertTrue(Thread.currentThread().isInterrupted());
    }

    @Test
    void requeue_ValidItem_ShouldIncrementAttemptsAndOffer() {
        MessageRetryQueue.RetryItem item = new MessageRetryQueue.RetryItem();
        item.setUserId("user1");
        item.setAttempts(0);
        
        retryQueue.requeue(item, "error2");
        
        assertEquals(1, item.getAttempts());
        assertEquals("error2", item.getLastError());
        verify(delayedQueue).offer(item, 500L, TimeUnit.MILLISECONDS); // 500 * 2^0 = 500
    }

    @Test
    void requeue_MaxAttemptsReached_ShouldDropMessage() {
        MessageRetryQueue.RetryItem item = new MessageRetryQueue.RetryItem();
        item.setUserId("user1");
        item.setAttempts(19);
        
        retryQueue.requeue(item, "error2");
        
        verify(delayedQueue, never()).offer(any(), anyLong(), any());
    }

    @Test
    void requeue_InvalidItem_ShouldReturn() {
        retryQueue.requeue(null, "error");
        retryQueue.requeue(new MessageRetryQueue.RetryItem(), "error"); // userId is null
        
        verify(delayedQueue, never()).offer(any(), anyLong(), any());
    }
}
