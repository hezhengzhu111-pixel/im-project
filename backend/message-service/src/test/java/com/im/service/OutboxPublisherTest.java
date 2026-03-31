package com.im.service;

import com.alibaba.fastjson2.JSON;
import com.im.entity.MessageOutboxEvent;
import com.im.mapper.MessageOutboxMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OutboxPublisherTest {

    @Mock
    private MessageOutboxMapper outboxMapper;

    @Mock
    private StringRedisTemplate stringRedisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @InjectMocks
    private OutboxPublisher outboxPublisher;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(outboxPublisher, "maxAttempts", 20);
        ReflectionTestUtils.setField(outboxPublisher, "baseBackoffMs", 1000L);
        ReflectionTestUtils.setField(outboxPublisher, "wsChannelPrefix", "im:ws:push:");
        ReflectionTestUtils.setField(outboxPublisher, "routeUserKeyPrefix", "im:route:user:");
        when(stringRedisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    @Test
    void publishById_shouldRouteAndPublishToRedisChannel() {
        MessageOutboxEvent event = new MessageOutboxEvent();
        event.setId(1L);
        event.setEventType("MESSAGE");
        event.setMessageKey("p_1_2");
        event.setTargetsJson(JSON.toJSONString(List.of(2L)));
        event.setPayload("{\"id\":\"100\",\"receiverId\":\"2\",\"content\":\"hello\"}");
        event.setRelatedMessageId(100L);

        when(outboxMapper.claimEventForSending(eq(1L), any(LocalDateTime.class), eq(20))).thenReturn(1);
        when(outboxMapper.selectById(1L)).thenReturn(event);
        when(valueOperations.get("im:route:user:2")).thenReturn("node-a");

        outboxPublisher.publishById(1L);

        verify(stringRedisTemplate).convertAndSend(eq("im:ws:push:node-a"), anyString());
        verify(outboxMapper).markSent(eq(1L), any(LocalDateTime.class));
    }

    @Test
    void publishById_shouldMarkSentWhenTargetOffline() {
        MessageOutboxEvent event = new MessageOutboxEvent();
        event.setId(2L);
        event.setEventType("MESSAGE");
        event.setMessageKey("p_1_3");
        event.setTargetsJson(JSON.toJSONString(List.of(3L)));
        event.setPayload("{\"id\":\"101\",\"receiverId\":\"3\",\"content\":\"offline\"}");
        event.setRelatedMessageId(101L);

        when(outboxMapper.claimEventForSending(eq(2L), any(LocalDateTime.class), eq(20))).thenReturn(1);
        when(outboxMapper.selectById(2L)).thenReturn(event);
        when(valueOperations.get("im:route:user:3")).thenReturn(null);

        outboxPublisher.publishById(2L);

        verify(stringRedisTemplate, never()).convertAndSend(anyString(), anyString());
        verify(outboxMapper).markSent(eq(2L), any(LocalDateTime.class));
    }
}
