package com.im.task;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
import com.im.enums.MessageType;
import com.im.mapper.MessageStateOutboxMapper;
import com.im.message.entity.MessageStateOutbox;
import com.im.service.support.MessageStateOutboxService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CompletableFuture;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageStateOutboxDispatchTaskTest {

    @Mock
    private MessageStateOutboxMapper messageStateOutboxMapper;

    @Mock
    private KafkaTemplate<String, ReadEvent> readEventKafkaTemplate;

    @Mock
    private KafkaTemplate<String, StatusChangeEvent> statusChangeEventKafkaTemplate;

    private MessageStateOutboxDispatchTask task;

    @BeforeEach
    void setUp() {
        task = new MessageStateOutboxDispatchTask(
                messageStateOutboxMapper,
                readEventKafkaTemplate,
                statusChangeEventKafkaTemplate
        );
        ReflectionTestUtils.setField(task, "dispatchBatchSize", 10);
        ReflectionTestUtils.setField(task, "retryDelayMs", 1000L);
        ReflectionTestUtils.setField(task, "retryMaxDelayMs", 8000L);
        ReflectionTestUtils.setField(task, "dispatchLeaseMs", 3000L);
        ReflectionTestUtils.setField(task, "kafkaSendTimeoutMs", 1000L);
    }

    @Test
    void dispatchPendingOutboxShouldRetryAndEventuallyDispatchReadEvent() {
        MessageStateOutbox outbox = readOutbox(7001L);
        CompletableFuture<?> failed = new CompletableFuture<>();
        failed.completeExceptionally(new IllegalStateException("broker unavailable"));

        when(messageStateOutboxMapper.selectDispatchableBatch(any(LocalDateTime.class), anyInt()))
                .thenReturn(List.of(outbox), List.of(outbox));
        when(messageStateOutboxMapper.markDispatchingById(eq(7001L), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(1, 1);
        when(readEventKafkaTemplate.send(anyString(), anyString(), any(ReadEvent.class)))
                .thenReturn((CompletableFuture) failed)
                .thenReturn(CompletableFuture.completedFuture(null));

        task.dispatchPendingOutbox();
        task.dispatchPendingOutbox();

        verify(messageStateOutboxMapper).markRetryById(eq(7001L), any(LocalDateTime.class), contains("broker unavailable"));
        verify(messageStateOutboxMapper).markDispatchedById(eq(7001L), any(LocalDateTime.class));
        verify(readEventKafkaTemplate, times(2)).send(eq("im-read-topic"), eq("p_1_2"), any(ReadEvent.class));
        verify(statusChangeEventKafkaTemplate, never()).send(anyString(), anyString(), any(StatusChangeEvent.class));
    }

    @Test
    void repeatedDispatchScanShouldNotResendAlreadyClaimedStatusOutbox() {
        MessageStateOutbox outbox = statusOutbox(7002L);

        when(messageStateOutboxMapper.selectDispatchableBatch(any(LocalDateTime.class), anyInt()))
                .thenReturn(List.of(outbox), List.of(outbox));
        when(messageStateOutboxMapper.markDispatchingById(eq(7002L), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(1, 0);
        when(statusChangeEventKafkaTemplate.send(anyString(), anyString(), any(StatusChangeEvent.class)))
                .thenReturn(CompletableFuture.completedFuture(null));

        task.dispatchPendingOutbox();
        task.dispatchPendingOutbox();

        verify(statusChangeEventKafkaTemplate, times(1))
                .send(eq("im-status-topic"), eq("p_1_2"), any(StatusChangeEvent.class));
        verify(messageStateOutboxMapper, times(1)).markDispatchedById(eq(7002L), any(LocalDateTime.class));
        verify(messageStateOutboxMapper, never()).markRetryById(eq(7002L), any(LocalDateTime.class), anyString());
        verify(readEventKafkaTemplate, never()).send(anyString(), anyString(), any(ReadEvent.class));
    }

    private MessageStateOutbox readOutbox(Long id) {
        ReadEvent event = ReadEvent.builder()
                .userId(1L)
                .targetUserId(2L)
                .conversationId("p_1_2")
                .group(false)
                .lastReadMessageId(99L)
                .timestamp(LocalDateTime.of(2026, 4, 17, 12, 0))
                .build();

        MessageStateOutbox outbox = new MessageStateOutbox();
        outbox.setId(id);
        outbox.setIdempotencyKey("READ:1:p_1_2:99:2026-04-17T12:00");
        outbox.setEventType(MessageStateOutboxService.EVENT_TYPE_READ);
        outbox.setTopic("im-read-topic");
        outbox.setRoutingKey("p_1_2");
        outbox.setPayloadJson(JSON.toJSONString(event));
        outbox.setDispatchStatus("PENDING");
        outbox.setAttemptCount(0);
        outbox.setNextAttemptTime(LocalDateTime.of(2026, 4, 17, 12, 0));
        return outbox;
    }

    private MessageStateOutbox statusOutbox(Long id) {
        StatusChangeEvent event = StatusChangeEvent.builder()
                .messageId(300L)
                .conversationId("p_1_2")
                .operatorUserId(1L)
                .senderId(1L)
                .receiverId(2L)
                .group(false)
                .newStatus(4)
                .statusText("RECALLED")
                .changedAt(LocalDateTime.of(2026, 4, 17, 12, 1))
                .payload(MessageDTO.builder()
                        .id(300L)
                        .senderId(1L)
                        .receiverId(2L)
                        .messageType(MessageType.TEXT)
                        .content("hello")
                        .status("RECALLED")
                        .createdTime(LocalDateTime.of(2026, 4, 17, 11, 59))
                        .build())
                .build();

        MessageStateOutbox outbox = new MessageStateOutbox();
        outbox.setId(id);
        outbox.setIdempotencyKey("STATUS:300:4:2026-04-17T12:01");
        outbox.setEventType(MessageStateOutboxService.EVENT_TYPE_STATUS_CHANGE);
        outbox.setTopic("im-status-topic");
        outbox.setRoutingKey("p_1_2");
        outbox.setPayloadJson(JSON.toJSONString(event));
        outbox.setDispatchStatus("PENDING");
        outbox.setAttemptCount(0);
        outbox.setNextAttemptTime(LocalDateTime.of(2026, 4, 17, 12, 1));
        return outbox;
    }
}
