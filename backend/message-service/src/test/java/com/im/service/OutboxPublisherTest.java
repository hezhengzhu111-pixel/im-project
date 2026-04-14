package com.im.service;

import com.alibaba.fastjson2.JSON;
import com.im.mapper.MessageOutboxMapper;
import com.im.message.entity.MessageOutboxEvent;
import com.im.metrics.MessageServiceMetrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RBucket;
import org.redisson.api.RSetMultimap;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OutboxPublisherTest {

    @Mock
    private MessageOutboxMapper outboxMapper;

    @Mock
    private RedissonClient redissonClient;

    @Mock
    private RSetMultimap<String, String> routeMultimap;

    @Mock
    private RTopic topicA;

    @Mock
    private RTopic topicB;

    @Mock
    private RBucket<String> liveBucketA;

    @Mock
    private RBucket<String> liveBucketB;

    @Mock
    private RBucket<String> staleBucket;

    private OutboxPublisher outboxPublisher;
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        outboxPublisher = new OutboxPublisher(outboxMapper, redissonClient);
        meterRegistry = new SimpleMeterRegistry();
        ReflectionTestUtils.setField(outboxPublisher, "metrics", new MessageServiceMetrics(meterRegistry));
        ReflectionTestUtils.setField(outboxPublisher, "maxAttempts", 20);
        ReflectionTestUtils.setField(outboxPublisher, "baseBackoffMs", 1000L);
        ReflectionTestUtils.setField(outboxPublisher, "wsChannelPrefix", "im:channel:");
        ReflectionTestUtils.setField(outboxPublisher, "routeUsersKey", "im:route:users");
        ReflectionTestUtils.setField(outboxPublisher, "routeLeaseKeyPrefix", "im:route:lease:");
        when(redissonClient.<String, String>getSetMultimap("im:route:users")).thenReturn(routeMultimap);
    }

    @Test
    void publishById_shouldPublishToEveryLiveInstanceTopic() {
        MessageOutboxEvent event = new MessageOutboxEvent();
        event.setId(1L);
        event.setEventType("MESSAGE");
        event.setTargetsJson(JSON.toJSONString(List.of(2L)));
        event.setPayload("{\"id\":\"100\",\"receiverId\":\"2\",\"content\":\"hello\"}");
        event.setRelatedMessageId(100L);

        when(outboxMapper.claimEventForSending(eq(1L), any(LocalDateTime.class), eq(20))).thenReturn(1);
        when(outboxMapper.selectById(1L)).thenReturn(event);
        when(routeMultimap.getAll("2")).thenReturn(new LinkedHashSet<>(List.of("node-a", "node-b")));
        when(redissonClient.<String>getBucket("im:route:lease:2:node-a")).thenReturn(liveBucketA);
        when(redissonClient.<String>getBucket("im:route:lease:2:node-b")).thenReturn(liveBucketB);
        when(liveBucketA.isExists()).thenReturn(true);
        when(liveBucketB.isExists()).thenReturn(true);
        when(redissonClient.getTopic("im:channel:node-a")).thenReturn(topicA);
        when(redissonClient.getTopic("im:channel:node-b")).thenReturn(topicB);

        outboxPublisher.publishById(1L);

        ArgumentCaptor<com.im.dto.WsPushEvent> captor = ArgumentCaptor.forClass(com.im.dto.WsPushEvent.class);
        verify(topicA).publish(captor.capture());
        verify(topicB).publish(any());
        assertEquals(List.of(2L), captor.getValue().getTargetUserIds());
        verify(outboxMapper).markSent(eq(1L), any(LocalDateTime.class));
        assertEquals(1.0, publishCount("success", "MESSAGE"));
        assertEquals(1L, meterRegistry.get("im.message.outbox.publish.duration")
                .tag("result", "success")
                .tag("event_type", "MESSAGE")
                .timer()
                .count());
    }

    @Test
    void publishById_shouldRemoveStaleRouteWithoutPublishing() {
        MessageOutboxEvent event = new MessageOutboxEvent();
        event.setId(2L);
        event.setEventType("MESSAGE");
        event.setTargetsJson(JSON.toJSONString(List.of(3L)));
        event.setPayload("{\"id\":\"101\",\"receiverId\":\"3\",\"content\":\"offline\"}");
        event.setRelatedMessageId(101L);

        when(outboxMapper.claimEventForSending(eq(2L), any(LocalDateTime.class), eq(20))).thenReturn(1);
        when(outboxMapper.selectById(2L)).thenReturn(event);
        when(routeMultimap.getAll("3")).thenReturn(new LinkedHashSet<>(List.of("stale-node")));
        when(redissonClient.<String>getBucket("im:route:lease:3:stale-node")).thenReturn(staleBucket);
        when(staleBucket.isExists()).thenReturn(false);

        outboxPublisher.publishById(2L);

        verify(routeMultimap).remove("3", "stale-node");
        verify(topicA, never()).publish(any());
        verify(topicB, never()).publish(any());
        verify(outboxMapper).markSent(eq(2L), any(LocalDateTime.class));
        assertEquals(1.0, publishCount("skipped", "MESSAGE"));
    }

    @Test
    void publishById_shouldRecordFailureWhenPublishThrows() {
        MessageOutboxEvent event = new MessageOutboxEvent();
        event.setId(3L);
        event.setEventType("MESSAGE");
        event.setTargetsJson(JSON.toJSONString(List.of(4L)));
        event.setPayload("{\"id\":\"102\",\"receiverId\":\"4\",\"content\":\"boom\"}");
        event.setRelatedMessageId(102L);
        event.setAttempts(0);

        when(outboxMapper.claimEventForSending(eq(3L), any(LocalDateTime.class), eq(20))).thenReturn(1);
        when(outboxMapper.selectById(3L)).thenReturn(event);
        when(routeMultimap.getAll("4")).thenReturn(new LinkedHashSet<>(List.of("node-a")));
        when(redissonClient.<String>getBucket("im:route:lease:4:node-a")).thenReturn(liveBucketA);
        when(liveBucketA.isExists()).thenReturn(true);
        when(redissonClient.getTopic("im:channel:node-a")).thenReturn(topicA);
        org.mockito.Mockito.doThrow(new RuntimeException("publish failed")).when(topicA).publish(any());

        outboxPublisher.publishById(3L);

        verify(outboxMapper).markFailed(eq(3L), eq("publish failed"), any(LocalDateTime.class));
        assertEquals(1.0, publishCount("failure", "MESSAGE"));
    }

    private double publishCount(String result, String eventType) {
        return meterRegistry.counter("im.message.outbox.publish.total", "result", result, "event_type", eventType).count();
    }
}
