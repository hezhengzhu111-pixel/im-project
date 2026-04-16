package com.im.consumer;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.dto.StatusChangeEvent;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
import com.im.message.entity.Message;
import com.im.service.MessagePersistenceService;
import com.im.service.support.PendingStatusEventService;
import com.im.service.support.PersistenceWatermarkService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class KafkaMessagePersisterTest {

    @Mock
    private MessagePersistenceService messagePersistenceService;

    @Mock
    private PersistenceWatermarkService persistenceWatermarkService;

    @Mock
    private PendingStatusEventService pendingStatusEventService;

    @Mock
    private KafkaMessageStatePersister kafkaMessageStatePersister;

    private KafkaMessagePersister persister;

    @BeforeEach
    void setUp() {
        persister = new KafkaMessagePersister(
                messagePersistenceService,
                persistenceWatermarkService,
                pendingStatusEventService,
                kafkaMessageStatePersister
        );
    }

    @Test
    void persistMessagesShouldConvertMessageEventsSaveBatchAndAdvanceWatermarks() {
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
        MessageEvent groupEvent = MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(1002L)
                .senderId(1L)
                .groupId(8L)
                .group(true)
                .clientMessageId("client-2")
                .messageType(MessageType.IMAGE)
                .mediaUrl("https://cdn/image.png")
                .createdTime(createdTime.plusSeconds(1))
                .build();
        MessageEvent readEvent = MessageEvent.builder()
                .eventType(MessageEventType.READ_RECEIPT)
                .messageId(2001L)
                .build();
        when(messagePersistenceService.saveBatch(any())).thenReturn(true);
        when(pendingStatusEventService.listByMessageId(any())).thenReturn(List.of());

        persister.persistMessages(List.of(
                record("p_1_2", messageEvent),
                record("g_8", groupEvent),
                record("p_1_2", readEvent)
        ));

        ArgumentCaptor<List<Message>> captor = ArgumentCaptor.forClass(List.class);
        verify(messagePersistenceService).saveBatch(captor.capture());
        List<Message> saved = captor.getValue();
        assertEquals(2, saved.size());
        assertEquals(1001L, saved.get(0).getId());
        assertEquals("client-1", saved.get(0).getClientMessageId());
        assertEquals(false, saved.get(0).getIsGroupChat());
        assertEquals(1002L, saved.get(1).getId());
        assertEquals(8L, saved.get(1).getGroupId());
        assertEquals(true, saved.get(1).getIsGroupChat());
        verify(persistenceWatermarkService).markPersisted("p_1_2", 1001L);
        verify(persistenceWatermarkService).markPersisted("g_8", 1002L);
    }

    @Test
    void persistMessagesShouldFallbackToSingleSaveAndMarkSuccessAndDuplicatesAsPersisted() {
        MessageEvent duplicated = MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(1000L)
                .senderId(1L)
                .receiverId(2L)
                .clientMsgId("client-dup")
                .messageType(MessageType.TEXT)
                .content("hello")
                .build();
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
        when(messagePersistenceService.save(any(Message.class))).thenAnswer(invocation -> {
            Message message = invocation.getArgument(0);
            if (Long.valueOf(1000L).equals(message.getId())) {
                throw new DuplicateKeyException("duplicate");
            }
            return true;
        });
        when(pendingStatusEventService.listByMessageId(any())).thenReturn(List.of());

        persister.persistMessages(List.of(record("p_1_2", duplicated), record("p_1_3", inserted)));

        verify(messagePersistenceService).saveBatch(any());
        verify(messagePersistenceService, times(2)).save(any(Message.class));
        verify(persistenceWatermarkService).markPersisted("p_1_2", 1000L);
        verify(persistenceWatermarkService).markPersisted("p_1_3", 1001L);
    }

    @Test
    void persistMessagesShouldRethrowNonDuplicateExceptionFromSingleSaveFallback() {
        MessageEvent event = minimalMessageEvent();
        doThrow(new DuplicateKeyException("duplicate")).when(messagePersistenceService).saveBatch(any());
        when(messagePersistenceService.save(any(Message.class))).thenThrow(new IllegalStateException("db down"));

        assertThrows(IllegalStateException.class,
                () -> persister.persistMessages(List.of(record("p_1_2", event))));

        verify(persistenceWatermarkService, never()).markPersisted(any(), any());
    }

    @Test
    void persistMessagesShouldSkipEmptyOrNonMessageBatchWithoutWatermarkMutation() {
        MessageEvent readEvent = MessageEvent.builder()
                .eventType(MessageEventType.READ_SYNC)
                .messageId(2002L)
                .build();

        persister.persistMessages(List.of(record("p_1_2", readEvent)));

        verify(messagePersistenceService, never()).saveBatch(any());
        verify(persistenceWatermarkService, never()).markPersisted(any(), any());
    }

    @Test
    void persistMessagesShouldImmediatelyReplayPendingStatusEventsAfterMarkPersisted() {
        MessageEvent event = minimalMessageEvent();
        StatusChangeEvent pendingEvent = StatusChangeEvent.builder()
                .messageId(1000L)
                .newStatus(Message.MessageStatus.RECALLED)
                .changedAt(LocalDateTime.of(2026, 4, 16, 10, 5))
                .payload(MessageDTO.builder().id(1000L).status("RECALLED").build())
                .build();
        when(messagePersistenceService.saveBatch(any())).thenReturn(true);
        when(pendingStatusEventService.listByMessageId(1000L)).thenReturn(List.of(pendingEvent));

        persister.persistMessages(List.of(record("p_1_2", event)));

        InOrder inOrder = inOrder(persistenceWatermarkService, pendingStatusEventService, kafkaMessageStatePersister);
        inOrder.verify(persistenceWatermarkService).markPersisted("p_1_2", 1000L);
        inOrder.verify(pendingStatusEventService).listByMessageId(1000L);
        inOrder.verify(kafkaMessageStatePersister).persistStatusChangeEvent(pendingEvent);
    }

    @Test
    void persistMessagesShouldKeepPersistenceFlowSuccessfulWhenImmediatePendingReplayFails() {
        MessageEvent event = minimalMessageEvent();
        StatusChangeEvent pendingEvent = StatusChangeEvent.builder()
                .messageId(1000L)
                .newStatus(Message.MessageStatus.DELETED)
                .changedAt(LocalDateTime.of(2026, 4, 16, 10, 6))
                .payload(MessageDTO.builder().id(1000L).status("DELETED").build())
                .build();
        when(messagePersistenceService.saveBatch(any())).thenReturn(true);
        when(pendingStatusEventService.listByMessageId(1000L)).thenReturn(List.of(pendingEvent));
        doThrow(new IllegalStateException("retry later"))
                .when(kafkaMessageStatePersister).persistStatusChangeEvent(pendingEvent);

        persister.persistMessages(List.of(record("p_1_2", event)));

        verify(persistenceWatermarkService).markPersisted("p_1_2", 1000L);
        verify(kafkaMessageStatePersister).persistStatusChangeEvent(pendingEvent);
    }

    @Test
    void resolveConversationIdShouldUseEventConversationIdWhenPresent() {
        MessageEvent event = MessageEvent.builder()
                .conversationId("p_5_9")
                .senderId(5L)
                .receiverId(9L)
                .build();

        String conversationId = ReflectionTestUtils.invokeMethod(persister, "resolveConversationId", event);

        assertEquals("p_5_9", conversationId);
    }

    @Test
    void resolveConversationIdShouldDerivePrivateAndGroupConversationIds() {
        MessageEvent privateEvent = MessageEvent.builder()
                .senderId(9L)
                .receiverId(5L)
                .build();
        MessageEvent groupEvent = MessageEvent.builder()
                .group(true)
                .groupId(8L)
                .build();

        assertEquals("p_5_9", ReflectionTestUtils.invokeMethod(persister, "resolveConversationId", privateEvent));
        assertEquals("g_8", ReflectionTestUtils.invokeMethod(persister, "resolveConversationId", groupEvent));
    }

    @Test
    void resolveConversationIdShouldRejectMissingRequiredFields() {
        MessageEvent invalidPrivateEvent = MessageEvent.builder()
                .senderId(1L)
                .build();
        MessageEvent invalidGroupEvent = MessageEvent.builder()
                .group(true)
                .build();

        assertThrows(IllegalArgumentException.class,
                () -> ReflectionTestUtils.invokeMethod(persister, "resolveConversationId", invalidPrivateEvent));
        assertThrows(IllegalArgumentException.class,
                () -> ReflectionTestUtils.invokeMethod(persister, "resolveConversationId", invalidGroupEvent));
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
