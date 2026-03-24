package com.im.service;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
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
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.concurrent.CompletableFuture;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OutboxPublisherTest {

    @Mock
    private KafkaTemplate<String, String> kafkaTemplate;

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
        ReflectionTestUtils.setField(outboxPublisher, "sendTimeoutMs", 30000L);
        ReflectionTestUtils.setField(outboxPublisher, "wsPushTopicPrefix", "im-ws-push-");
        ReflectionTestUtils.setField(outboxPublisher, "routeUserKeyPrefix", "im:route:user:");
        ReflectionTestUtils.setField(outboxPublisher, "privateMessageTopic", "im-private-message-topic");
        ReflectionTestUtils.setField(outboxPublisher, "groupMessageTopic", "im-group-message-topic");
        ReflectionTestUtils.setField(outboxPublisher, "readReceiptTopic", "im-read-receipt-topic");
        when(stringRedisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    @Test
    void publishById_shouldRouteAndSendToKafka() {
        MessageDTO dto = new MessageDTO();
        dto.setId(100L);
        dto.setReceiverId(2L);
        dto.setContent("hello");

        MessageOutboxEvent event = new MessageOutboxEvent();
        event.setId(1L);
        event.setTopic("im-private-message-topic");
        event.setMessageKey("p_1_2");
        event.setPayload(JSON.toJSONString(dto));

        when(outboxMapper.claimEventForSending(eq(1L), any(LocalDateTime.class), eq(20))).thenReturn(1);
        when(outboxMapper.selectById(1L)).thenReturn(event);
        when(valueOperations.get("im:route:user:2")).thenReturn("node-a");
        when(kafkaTemplate.send(anyString(), anyString(), anyString())).thenReturn(CompletableFuture.completedFuture(null));

        outboxPublisher.publishById(1L);

        verify(kafkaTemplate).send(eq("im-ws-push-node-a"), eq("p_1_2:node-a"), anyString());
        verify(outboxMapper).markSent(eq(1L), any(LocalDateTime.class));
    }

    @Test
    void publishById_shouldMarkSentWhenTargetOffline() {
        MessageDTO dto = new MessageDTO();
        dto.setId(101L);
        dto.setReceiverId(3L);
        dto.setContent("offline");

        MessageOutboxEvent event = new MessageOutboxEvent();
        event.setId(2L);
        event.setTopic("im-private-message-topic");
        event.setMessageKey("p_1_3");
        event.setPayload(JSON.toJSONString(dto));

        when(outboxMapper.claimEventForSending(eq(2L), any(LocalDateTime.class), eq(20))).thenReturn(1);
        when(outboxMapper.selectById(2L)).thenReturn(event);
        when(valueOperations.get("im:route:user:3")).thenReturn(null);

        outboxPublisher.publishById(2L);

        verify(kafkaTemplate, never()).send(anyString(), anyString(), anyString());
        verify(outboxMapper).markSent(eq(2L), any(LocalDateTime.class));
    }
}
