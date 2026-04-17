package com.im.consumer;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.dto.StatusChangeEvent;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
import com.im.mapper.GroupReadCursorMapper;
import com.im.mapper.MessageMapper;
import com.im.mapper.PrivateReadCursorMapper;
import com.im.message.entity.Message;
import com.im.service.ConversationCacheUpdater;
import com.im.service.MessagePersistenceService;
import com.im.service.orchestrator.MessageStateOrchestrator;
import com.im.service.support.*;
import com.im.utils.SnowflakeIdGenerator;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.TransientDataAccessResourceException;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
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
    private AcceptedMessageProjectionService acceptedMessageProjectionService;

    @Mock
    private HotMessageRedisRepository hotMessageRedisRepository;

    @Mock
    private MessageMapper messageMapper;

    @Mock
    private UserProfileCache userProfileCache;

    @Mock
    private ConversationCacheUpdater conversationCacheUpdater;

    @Mock
    private GroupReadCursorMapper groupReadCursorMapper;

    @Mock
    private PrivateReadCursorMapper privateReadCursorMapper;

    @Mock
    private SnowflakeIdGenerator snowflakeIdGenerator;

    private MessageStateOrchestrator orchestrator;
    private KafkaMessagePersister persister;

    @BeforeEach
    void setUp() {
        orchestrator = new MessageStateOrchestrator(
                snowflakeIdGenerator,
                hotMessageRedisRepository,
                acceptedMessageProjectionService,
                messageMapper,
                userProfileCache,
                persistenceWatermarkService,
                pendingStatusEventService,
                conversationCacheUpdater,
                groupReadCursorMapper,
                privateReadCursorMapper
        );
        persister = new KafkaMessagePersister(
                messagePersistenceService,
                orchestrator
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
                record(0, 0L, "p_1_2", messageEvent),
                record(1, 0L, "g_8", groupEvent),
                record(0, 1L, "p_1_2", readEvent)
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
        verify(acceptedMessageProjectionService).markPersisted(messageEvent);
        verify(acceptedMessageProjectionService).markPersisted(groupEvent);
    }

    @Test
    void persistMessageBatchShouldIsolateMixedSuccessDuplicateAndPoisonRecords() {
        MessageEvent success = event(1001L, 1L, 2L, "client-success", "hello");
        MessageEvent duplicate = event(1002L, 1L, 3L, "client-dup", "dup");
        MessageEvent poison = event(1003L, 1L, 4L, "client-poison", "bad");
        doThrow(new DataIntegrityViolationException("batch contains invalid row"))
                .when(messagePersistenceService).saveBatch(any());
        when(messagePersistenceService.save(any(Message.class))).thenAnswer(invocation -> {
            Message message = invocation.getArgument(0);
            if (Long.valueOf(1001L).equals(message.getId())) {
                return true;
            }
            if (Long.valueOf(1002L).equals(message.getId())) {
                throw new DuplicateKeyException("duplicate row");
            }
            throw new DataIntegrityViolationException("bad payload");
        });
        when(pendingStatusEventService.listByMessageId(any())).thenReturn(List.of());

        KafkaMessagePersistBatchResult result = persister.persistMessageBatch(List.of(
                record(0, 0L, "p_1_2", success),
                record(0, 1L, "p_1_3", duplicate),
                record(0, 2L, "p_1_4", poison)
        ));

        assertEquals(3, result.getMessageCount());
        assertEquals(1, result.getSuccessCount());
        assertEquals(1, result.getDuplicateCount());
        assertEquals(1, result.getPoisonCount());
        assertEquals(0, result.getRetryableCount());
        assertEquals(1001L, result.getSuccessDetails().get(0).messageId());
        assertEquals(1002L, result.getDuplicateDetails().get(0).messageId());
        assertTrue(result.getPoisonDetails().get(0).reason().contains("bad payload"));
        verify(messagePersistenceService).saveBatch(any());
        verify(messagePersistenceService, times(3)).save(any(Message.class));
        verify(persistenceWatermarkService).markPersisted("p_1_2", 1001L);
        verify(persistenceWatermarkService).markPersisted("p_1_3", 1002L);
        verify(persistenceWatermarkService, never()).markPersisted("p_1_4", 1003L);
        verify(acceptedMessageProjectionService).markPersisted(success);
        verify(acceptedMessageProjectionService).markPersisted(duplicate);
        verify(acceptedMessageProjectionService, never()).markPersisted(poison);
    }

    @Test
    void persistMessageBatchShouldRetryRecoverableRowsWithoutPermanentBatchFailureAndPreservePartitionOrder() {
        MessageEvent first = event(2001L, 1L, 2L, "client-1", "first");
        MessageEvent retryable = event(2002L, 1L, 2L, "client-2", "second");
        MessageEvent deferred = event(2003L, 1L, 2L, "client-3", "third");
        doThrow(new DataIntegrityViolationException("fallback to row mode"))
                .when(messagePersistenceService).saveBatch(any());
        AtomicInteger round = new AtomicInteger(1);
        when(messagePersistenceService.save(any(Message.class))).thenAnswer(invocation -> {
            Message message = invocation.getArgument(0);
            if (round.get() == 1) {
                if (Long.valueOf(2001L).equals(message.getId())) {
                    return true;
                }
                if (Long.valueOf(2002L).equals(message.getId())) {
                    throw new TransientDataAccessResourceException("db busy");
                }
                throw new AssertionError("later message in same partition should be deferred");
            }
            if (Long.valueOf(2001L).equals(message.getId())) {
                throw new DuplicateKeyException("already persisted");
            }
            return true;
        });
        when(pendingStatusEventService.listByMessageId(any())).thenReturn(List.of());
        List<ConsumerRecord<String, MessageEvent>> records = List.of(
                record(0, 0L, "p_1_2", first),
                record(0, 1L, "p_1_2", retryable),
                record(0, 2L, "p_1_2", deferred)
        );

        KafkaMessagePersistBatchResult firstAttempt = persister.persistMessageBatch(records);

        assertEquals(1, firstAttempt.getSuccessCount());
        assertEquals(0, firstAttempt.getDuplicateCount());
        assertEquals(0, firstAttempt.getPoisonCount());
        assertEquals(2, firstAttempt.getRetryableCount());
        assertEquals(2002L, firstAttempt.getRetryableDetails().get(0).messageId());
        assertTrue(firstAttempt.getRetryableDetails().get(1).reason().contains("deferred after retryable"));
        verify(messagePersistenceService, times(2)).save(any(Message.class));
        verify(persistenceWatermarkService).markPersisted("p_1_2", 2001L);
        verify(acceptedMessageProjectionService).markPersisted(first);
        verify(acceptedMessageProjectionService, never()).markPersisted(retryable);
        verify(acceptedMessageProjectionService, never()).markPersisted(deferred);

        clearInvocations(messagePersistenceService, persistenceWatermarkService, acceptedMessageProjectionService);
        round.set(2);

        KafkaMessagePersistBatchResult secondAttempt = persister.persistMessageBatch(records);

        assertEquals(2, secondAttempt.getSuccessCount());
        assertEquals(1, secondAttempt.getDuplicateCount());
        assertEquals(0, secondAttempt.getPoisonCount());
        assertEquals(0, secondAttempt.getRetryableCount());
        verify(messagePersistenceService, times(3)).save(any(Message.class));
        InOrder inOrder = inOrder(persistenceWatermarkService, acceptedMessageProjectionService);
        inOrder.verify(persistenceWatermarkService).markPersisted("p_1_2", 2001L);
        inOrder.verify(acceptedMessageProjectionService).markPersisted(first);
        inOrder.verify(persistenceWatermarkService).markPersisted("p_1_2", 2002L);
        inOrder.verify(acceptedMessageProjectionService).markPersisted(retryable);
        inOrder.verify(persistenceWatermarkService).markPersisted("p_1_2", 2003L);
        inOrder.verify(acceptedMessageProjectionService).markPersisted(deferred);
    }

    @Test
    void persistMessageBatchShouldClassifyWholeBatchRetryableErrorsWithoutSingleRowFallback() {
        MessageEvent first = event(3001L, 1L, 2L, "client-1", "hello");
        MessageEvent second = event(3002L, 1L, 3L, "client-2", "world");
        doThrow(new TransientDataAccessResourceException("db unavailable"))
                .when(messagePersistenceService).saveBatch(any());

        KafkaMessagePersistBatchResult result = persister.persistMessageBatch(List.of(
                record(0, 0L, "p_1_2", first),
                record(1, 0L, "p_1_3", second)
        ));

        assertEquals(0, result.getSuccessCount());
        assertEquals(0, result.getDuplicateCount());
        assertEquals(0, result.getPoisonCount());
        assertEquals(2, result.getRetryableCount());
        assertTrue(result.getRetryableDetails().get(0).reason().contains("db unavailable"));
        verify(messagePersistenceService).saveBatch(any());
        verify(messagePersistenceService, never()).save(any(Message.class));
        verify(persistenceWatermarkService, never()).markPersisted(any(), any());
    }

    @Test
    void persistMessagesShouldThrowWhenRetryableRowsRemain() {
        MessageEvent event = event(4001L, 1L, 2L, "client-throw", "retry");
        doThrow(new TransientDataAccessResourceException("db down"))
                .when(messagePersistenceService).saveBatch(any());

        IllegalStateException exception = assertThrows(IllegalStateException.class,
                () -> persister.persistMessages(List.of(record(0, 0L, "p_1_2", event))));

        assertTrue(exception.getMessage().contains("retryable kafka message persistence failures"));
        verify(messagePersistenceService, never()).save(any(Message.class));
    }

    @Test
    void persistMessagesShouldSkipEmptyOrNonMessageBatchWithoutWatermarkMutation() {
        MessageEvent readEvent = MessageEvent.builder()
                .eventType(MessageEventType.READ_SYNC)
                .messageId(2002L)
                .build();

        persister.persistMessages(List.of(record(0, 0L, "p_1_2", readEvent)));

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
        when(messageMapper.selectById(1000L)).thenReturn(persistedMessage(1000L, Message.MessageStatus.SENT,
                LocalDateTime.of(2026, 4, 16, 10, 0)));
        when(messageMapper.updateById(any(Message.class))).thenReturn(1);

        persister.persistMessages(List.of(record(0, 0L, "p_1_2", event)));

        InOrder inOrder = inOrder(persistenceWatermarkService, pendingStatusEventService, messageMapper, conversationCacheUpdater);
        inOrder.verify(persistenceWatermarkService).markPersisted("p_1_2", 1000L);
        verify(acceptedMessageProjectionService).markPersisted(event);
        inOrder.verify(pendingStatusEventService).listByMessageId(1000L);
        inOrder.verify(messageMapper).selectById(1000L);
        inOrder.verify(messageMapper).updateById(any(Message.class));
        verify(conversationCacheUpdater).applyStatusChange(pendingEvent);
        verify(pendingStatusEventService).remove(1000L, Message.MessageStatus.RECALLED);
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
                .when(messageMapper).selectById(1000L);

        persister.persistMessages(List.of(record(0, 0L, "p_1_2", event)));

        verify(persistenceWatermarkService).markPersisted("p_1_2", 1000L);
        verify(acceptedMessageProjectionService).markPersisted(event);
        verify(messageMapper).selectById(1000L);
    }

    @Test
    void resolveConversationIdShouldUseEventConversationIdWhenPresent() {
        MessageEvent event = MessageEvent.builder()
                .conversationId("p_5_9")
                .senderId(5L)
                .receiverId(9L)
                .build();

        String conversationId = ReflectionTestUtils.invokeMethod(orchestrator, "resolveConversationId", event);

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

        assertEquals("p_5_9", ReflectionTestUtils.invokeMethod(orchestrator, "resolveConversationId", privateEvent));
        assertEquals("g_8", ReflectionTestUtils.invokeMethod(orchestrator, "resolveConversationId", groupEvent));
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
                () -> ReflectionTestUtils.invokeMethod(orchestrator, "resolveConversationId", invalidPrivateEvent));
        assertThrows(IllegalArgumentException.class,
                () -> ReflectionTestUtils.invokeMethod(orchestrator, "resolveConversationId", invalidGroupEvent));
    }

    private ConsumerRecord<String, MessageEvent> record(int partition, long offset, String key, MessageEvent event) {
        return new ConsumerRecord<>("im-chat-topic", partition, offset, key, event);
    }

    private MessageEvent minimalMessageEvent() {
        return event(1000L, 1L, 2L, "client-min", "hello");
    }

    private MessageEvent event(Long messageId,
                               Long senderId,
                               Long receiverId,
                               String clientMessageId,
                               String content) {
        return MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(messageId)
                .senderId(senderId)
                .receiverId(receiverId)
                .clientMsgId(clientMessageId)
                .clientMessageId(clientMessageId)
                .messageType(MessageType.TEXT)
                .content(content)
                .conversationId(senderId == null || receiverId == null ? null : "p_" + Math.min(senderId, receiverId) + "_" + Math.max(senderId, receiverId))
                .createdTime(LocalDateTime.of(2026, 4, 16, 10, 0))
                .updatedTime(LocalDateTime.of(2026, 4, 16, 10, 0))
                .build();
    }

    private Message persistedMessage(Long messageId, Integer status, LocalDateTime updatedTime) {
        Message message = new Message();
        message.setId(messageId);
        message.setStatus(status);
        message.setUpdatedTime(updatedTime);
        return message;
    }
}
