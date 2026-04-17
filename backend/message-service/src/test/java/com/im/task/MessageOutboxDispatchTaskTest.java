package com.im.task;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
import com.im.mapper.MessageOutboxMapper;
import com.im.message.entity.MessageOutbox;
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
class MessageOutboxDispatchTaskTest {

    @Mock
    private MessageOutboxMapper messageOutboxMapper;

    @Mock
    private KafkaTemplate<String, MessageEvent> kafkaTemplate;

    private MessageOutboxDispatchTask task;

    @BeforeEach
    void setUp() {
        task = new MessageOutboxDispatchTask(messageOutboxMapper, kafkaTemplate);
        ReflectionTestUtils.setField(task, "dispatchBatchSize", 10);
        ReflectionTestUtils.setField(task, "retryDelayMs", 1000L);
        ReflectionTestUtils.setField(task, "kafkaSendTimeoutMs", 1000L);
    }

    @Test
    void dispatchPendingOutboxShouldMarkRetryWhenKafkaTemporarilyFailsAndKeepDurableRows() {
        MessageOutbox outbox = outbox(9001L, "client-1");
        CompletableFuture<?> failed = new CompletableFuture<>();
        failed.completeExceptionally(new IllegalStateException("broker temporarily unavailable"));
        when(messageOutboxMapper.selectDispatchableBatch(any(LocalDateTime.class), anyInt())).thenReturn(List.of(outbox));
        when(kafkaTemplate.send(anyString(), anyString(), any(MessageEvent.class))).thenReturn((CompletableFuture) failed);

        task.dispatchPendingOutbox();

        verify(messageOutboxMapper).markRetryById(eq(9001L), any(LocalDateTime.class), contains("broker temporarily unavailable"));
        verify(messageOutboxMapper, never()).markDispatchedById(any(), any());
    }

    @Test
    void dispatchPendingOutboxShouldRetryLaterAndEventuallyDispatchSuccessfully() {
        MessageOutbox outbox = outbox(9002L, "client-2");
        CompletableFuture<?> failed = new CompletableFuture<>();
        failed.completeExceptionally(new IllegalStateException("broker down"));
        when(messageOutboxMapper.selectDispatchableBatch(any(LocalDateTime.class), anyInt()))
                .thenReturn(List.of(outbox), List.of(outbox));
        when(kafkaTemplate.send(anyString(), anyString(), any(MessageEvent.class)))
                .thenReturn((CompletableFuture) failed)
                .thenReturn(CompletableFuture.completedFuture(null));

        task.dispatchPendingOutbox();
        task.dispatchPendingOutbox();

        verify(messageOutboxMapper).markRetryById(eq(9002L), any(LocalDateTime.class), contains("broker down"));
        verify(messageOutboxMapper).markDispatchedById(eq(9002L), any(LocalDateTime.class));
    }

    private MessageOutbox outbox(Long messageId, String clientMessageId) {
        MessageEvent event = MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(messageId)
                .conversationId("p_1_2")
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId(clientMessageId)
                .clientMsgId(clientMessageId)
                .messageType(MessageType.TEXT)
                .content("hello")
                .payload(MessageDTO.builder()
                        .id(messageId)
                        .senderId(1L)
                        .receiverId(2L)
                        .clientMessageId(clientMessageId)
                        .messageType(MessageType.TEXT)
                        .content("hello")
                        .ackStage(MessageDTO.ACK_STAGE_ACCEPTED)
                        .createdTime(LocalDateTime.of(2026, 4, 16, 10, 0))
                        .build())
                .build();

        MessageOutbox outbox = new MessageOutbox();
        outbox.setId(messageId);
        outbox.setSenderId(1L);
        outbox.setClientMessageId(clientMessageId);
        outbox.setConversationId("p_1_2");
        outbox.setTopic("im-chat-topic");
        outbox.setRoutingKey("p_1_2");
        outbox.setDispatchStatus("PENDING");
        outbox.setAttemptCount(0);
        outbox.setNextAttemptTime(LocalDateTime.of(2026, 4, 16, 10, 0));
        outbox.setEventJson(JSON.toJSONString(event));
        return outbox;
    }
}
