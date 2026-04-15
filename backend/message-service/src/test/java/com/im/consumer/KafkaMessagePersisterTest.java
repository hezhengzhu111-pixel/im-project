package com.im.consumer;

import com.im.dto.MessageEvent;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
import com.im.message.entity.Message;
import com.im.service.MessagePersistenceService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KafkaMessagePersisterTest {

    @Mock
    private MessagePersistenceService messagePersistenceService;

    @Test
    void persistMessagesShouldConvertMessageEventsAndSaveBatch() {
        KafkaMessagePersister persister = new KafkaMessagePersister(messagePersistenceService);
        LocalDateTime createdTime = LocalDateTime.of(2026, 4, 15, 15, 30);
        MessageEvent messageEvent = MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(1001L)
                .conversationId("p_1_2")
                .senderId(1L)
                .receiverId(2L)
                .clientMsgId("client-1")
                .messageType(MessageType.TEXT)
                .content("hello")
                .status(Message.MessageStatus.SENT)
                .createdTime(createdTime)
                .updatedTime(createdTime)
                .build();
        MessageEvent readEvent = MessageEvent.builder()
                .eventType(MessageEventType.READ_RECEIPT)
                .messageId(2001L)
                .build();
        when(messagePersistenceService.saveBatch(any())).thenReturn(true);

        persister.persistMessages(List.of(record("p_1_2", messageEvent), record("p_1_2", readEvent)));

        ArgumentCaptor<List<Message>> captor = ArgumentCaptor.forClass(List.class);
        verify(messagePersistenceService).saveBatch(captor.capture());
        List<Message> saved = captor.getValue();
        assertEquals(1, saved.size());
        Message message = saved.getFirst();
        assertEquals(1001L, message.getId());
        assertEquals(1L, message.getSenderId());
        assertEquals(2L, message.getReceiverId());
        assertEquals("client-1", message.getClientMessageId());
        assertEquals(MessageType.TEXT, message.getMessageType());
        assertEquals("hello", message.getContent());
        assertEquals(Message.MessageStatus.SENT, message.getStatus());
        assertEquals(false, message.getIsGroupChat());
        assertEquals(createdTime, message.getCreatedTime());
    }

    @Test
    void persistMessagesShouldPersistGroupMessageFields() {
        KafkaMessagePersister persister = new KafkaMessagePersister(messagePersistenceService);
        MessageEvent groupEvent = MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(1002L)
                .conversationId("g_8")
                .senderId(1L)
                .groupId(8L)
                .clientMessageId("client-2")
                .messageType(MessageType.IMAGE)
                .mediaUrl("https://cdn/image.png")
                .group(true)
                .build();
        when(messagePersistenceService.saveBatch(any())).thenReturn(true);

        persister.persistMessages(List.of(record("g_8", groupEvent)));

        ArgumentCaptor<List<Message>> captor = ArgumentCaptor.forClass(List.class);
        verify(messagePersistenceService).saveBatch(captor.capture());
        Message message = captor.getValue().getFirst();
        assertEquals(1002L, message.getId());
        assertEquals(8L, message.getGroupId());
        assertEquals("client-2", message.getClientMessageId());
        assertEquals(MessageType.IMAGE, message.getMessageType());
        assertEquals("https://cdn/image.png", message.getMediaUrl());
        assertEquals(true, message.getIsGroupChat());
        assertEquals(Message.MessageStatus.SENT, message.getStatus());
    }

    @Test
    void persistMessagesShouldFallbackToSingleSaveAndIgnoreDuplicateRows() {
        KafkaMessagePersister persister = new KafkaMessagePersister(messagePersistenceService);
        MessageEvent duplicated = minimalMessageEvent();
        MessageEvent inserted = MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(1001L)
                .senderId(1L)
                .receiverId(3L)
                .clientMsgId("client-new")
                .messageType(MessageType.TEXT)
                .content("world")
                .build();
        doThrow(new DuplicateKeyException("duplicate")).when(messagePersistenceService).saveBatch(any());
        doThrow(new DuplicateKeyException("duplicate")).when(messagePersistenceService).save(any(Message.class));
        when(messagePersistenceService.save(argThat(message -> message != null && Long.valueOf(1001L).equals(message.getId()))))
                .thenReturn(true);

        persister.persistMessages(List.of(record("p_1_2", duplicated), record("p_1_3", inserted)));

        verify(messagePersistenceService).saveBatch(any());
        verify(messagePersistenceService).save(argThat(message -> message != null && Long.valueOf(1000L).equals(message.getId())));
        verify(messagePersistenceService).save(argThat(message -> message != null && Long.valueOf(1001L).equals(message.getId())));
    }

    @Test
    void persistMessagesShouldRethrowNonDuplicateExceptionForKafkaRetry() {
        KafkaMessagePersister persister = new KafkaMessagePersister(messagePersistenceService);
        doThrow(new IllegalStateException("db down")).when(messagePersistenceService).saveBatch(any());

        assertThrows(IllegalStateException.class,
                () -> persister.persistMessages(List.of(record("p_1_2", minimalMessageEvent()))));
    }

    @Test
    void persistMessagesShouldSkipEmptyOrNonMessageBatchWithoutConversationSideEffects() {
        KafkaMessagePersister persister = new KafkaMessagePersister(messagePersistenceService);
        MessageEvent readEvent = MessageEvent.builder()
                .eventType(MessageEventType.READ_SYNC)
                .messageId(2002L)
                .build();

        persister.persistMessages(List.of(record("p_1_2", readEvent)));

        verify(messagePersistenceService, never()).saveBatch(any());
    }

    private ConsumerRecord<String, MessageEvent> record(String key, MessageEvent event) {
        return new ConsumerRecord<>("im-chat-topic", 0, 0, key, event);
    }

    private MessageEvent minimalMessageEvent() {
        return MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(1000L)
                .senderId(1L)
                .receiverId(2L)
                .clientMsgId("client-min")
                .messageType(MessageType.TEXT)
                .content("hello")
                .build();
    }
}
