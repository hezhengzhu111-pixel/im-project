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
import com.im.metrics.MessageServiceMetrics;
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
import org.springframework.dao.TransientDataAccessResourceException;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
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

    @Mock
    private KafkaTemplate<String, Object> poisonRecordDltKafkaTemplate;

    @Mock
    private MessageServiceMetrics messageServiceMetrics;

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
                orchestrator,
                poisonRecordDltKafkaTemplate,
                messageServiceMetrics
        );
        lenient().when(poisonRecordDltKafkaTemplate.send(anyString(), anyString(), any()))
                .thenReturn(CompletableFuture.completedFuture(null));
        lenient().when(pendingStatusEventService.listByMessageId(any()))
                .thenReturn(List.of());
    }

    @Test
    void persistMessagesShouldConvertMessageEventsPersistInNativeBatchAndAdvanceWatermarks() {
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
        when(messagePersistenceService.persistIdempotentBatch(any())).thenAnswer(invocation ->
                insertedResult(invocation.getArgument(0)));

        persister.persistMessages(List.of(
                record(0, 0L, "p_1_2", messageEvent),
                record(1, 0L, "g_8", groupEvent),
                record(0, 1L, "p_1_2", readEvent)
        ));

        ArgumentCaptor<List<Message>> captor = ArgumentCaptor.forClass(List.class);
        verify(messagePersistenceService).persistIdempotentBatch(captor.capture());
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
        when(messagePersistenceService.persistIdempotentBatch(any())).thenAnswer(invocation -> {
            List<Message> messages = invocation.getArgument(0);
            if (containsMessage(messages, 1003L)) {
                throw new DataIntegrityViolationException("bad payload");
            }
            return resultFor(messages, Set.of(1002L));
        });

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
        verify(persistenceWatermarkService).markPersisted("p_1_2", 1001L);
        verify(persistenceWatermarkService).markPersisted("p_1_3", 1002L);
        verify(persistenceWatermarkService, never()).markPersisted("p_1_4", 1003L);
        verify(acceptedMessageProjectionService).markPersisted(success);
        verify(acceptedMessageProjectionService).markPersisted(duplicate);
        verify(acceptedMessageProjectionService, never()).markPersisted(poison);
        verify(poisonRecordDltKafkaTemplate).send(eq("im-chat-topic.dlt"), eq("1003"), any());
        verify(messageServiceMetrics).recordPoison();
        verify(messageServiceMetrics).recordDlt();
    }

    @Test
    void persistMessageBatchShouldClassifyWholeBatchRetryableErrorsWithoutBinarySplit() {
        MessageEvent first = event(3001L, 1L, 2L, "client-1", "hello");
        MessageEvent second = event(3002L, 1L, 3L, "client-2", "world");
        when(messagePersistenceService.persistIdempotentBatch(any()))
                .thenThrow(new TransientDataAccessResourceException("db unavailable"));

        KafkaMessagePersistBatchResult result = persister.persistMessageBatch(List.of(
                record(0, 0L, "p_1_2", first),
                record(1, 0L, "p_1_3", second)
        ));

        assertEquals(0, result.getSuccessCount());
        assertEquals(0, result.getDuplicateCount());
        assertEquals(0, result.getPoisonCount());
        assertEquals(2, result.getRetryableCount());
        assertTrue(result.getRetryableDetails().get(0).reason().contains("db unavailable"));
        verify(messagePersistenceService).persistIdempotentBatch(any());
        verifyNoInteractions(poisonRecordDltKafkaTemplate);
        verify(messageServiceMetrics, times(2)).recordRetryable();
        verify(persistenceWatermarkService, never()).markPersisted(any(), any());
    }

    @Test
    void persistMessagesShouldThrowWhenRetryableRowsRemain() {
        MessageEvent event = event(4001L, 1L, 2L, "client-throw", "retry");
        when(messagePersistenceService.persistIdempotentBatch(any()))
                .thenThrow(new TransientDataAccessResourceException("db down"));

        IllegalStateException exception = assertThrows(IllegalStateException.class,
                () -> persister.persistMessages(List.of(record(0, 0L, "p_1_2", event))));

        assertTrue(exception.getMessage().contains("retryable kafka message persistence failures"));
    }

    @Test
    void persistMessagesShouldSkipEmptyOrNonMessageBatchWithoutWatermarkMutation() {
        MessageEvent readEvent = MessageEvent.builder()
                .eventType(MessageEventType.READ_SYNC)
                .messageId(2002L)
                .build();

        persister.persistMessages(List.of(record(0, 0L, "p_1_2", readEvent)));

        verifyNoInteractions(messagePersistenceService);
        verify(persistenceWatermarkService, never()).markPersisted(any(), any());
        verifyNoInteractions(poisonRecordDltKafkaTemplate);
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
        when(messagePersistenceService.persistIdempotentBatch(any())).thenAnswer(invocation ->
                insertedResult(invocation.getArgument(0)));
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
        when(messagePersistenceService.persistIdempotentBatch(any())).thenAnswer(invocation ->
                insertedResult(invocation.getArgument(0)));
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

    @Test
    void persistMessagesShouldPublishMissingMessageIdToDltWithOriginalPositionAndNotRetry() {
        MessageEvent poison = MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .conversationId("p_1_2")
                .senderId(1L)
                .receiverId(2L)
                .clientMsgId("client-missing-id")
                .clientMessageId("client-missing-id")
                .messageType(MessageType.TEXT)
                .content("bad")
                .createdTime(LocalDateTime.of(2026, 4, 16, 10, 0))
                .updatedTime(LocalDateTime.of(2026, 4, 16, 10, 0))
                .build();

        assertDoesNotThrow(() -> persister.persistMessages(List.of(record(3, 18L, "p_1_2", poison))));

        ArgumentCaptor<KafkaMessagePersister.PoisonMessageDltPayload> captor =
                ArgumentCaptor.forClass(KafkaMessagePersister.PoisonMessageDltPayload.class);
        verify(poisonRecordDltKafkaTemplate).send(eq("im-chat-topic.dlt"), eq("client-missing-id"), captor.capture());
        KafkaMessagePersister.PoisonMessageDltPayload payload = captor.getValue();
        assertEquals("im-chat-topic", payload.originalTopic());
        assertEquals(3, payload.originalPartition());
        assertEquals(18L, payload.originalOffset());
        assertNull(payload.messageId());
        assertEquals("client-missing-id", payload.clientMessageId());
        assertEquals("p_1_2", payload.conversationId());
        assertTrue(payload.exceptionType().contains("IllegalArgumentException"));
        assertTrue(payload.exceptionSummary().contains("messageId cannot be null"));
        verifyNoInteractions(messagePersistenceService);
        verify(messageServiceMetrics).recordPoison();
        verify(messageServiceMetrics).recordDlt();
        verify(messageServiceMetrics, never()).recordRetryable();
    }

    @Test
    void persistMessagesShouldPublishGroupMessagesMissingGroupIdToDltEvenWhenConversationIdExists() {
        MessageEvent poison = MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(5001L)
                .conversationId("g_99")
                .senderId(1L)
                .group(true)
                .clientMsgId("client-group")
                .clientMessageId("client-group")
                .messageType(MessageType.TEXT)
                .content("bad-group")
                .createdTime(LocalDateTime.of(2026, 4, 16, 10, 0))
                .updatedTime(LocalDateTime.of(2026, 4, 16, 10, 0))
                .build();

        assertDoesNotThrow(() -> persister.persistMessages(List.of(record(1, 6L, "g_99", poison))));

        ArgumentCaptor<KafkaMessagePersister.PoisonMessageDltPayload> captor =
                ArgumentCaptor.forClass(KafkaMessagePersister.PoisonMessageDltPayload.class);
        verify(poisonRecordDltKafkaTemplate).send(eq("im-chat-topic.dlt"), eq("5001"), captor.capture());
        KafkaMessagePersister.PoisonMessageDltPayload payload = captor.getValue();
        assertEquals(5001L, payload.messageId());
        assertEquals("g_99", payload.conversationId());
        assertTrue(payload.exceptionSummary().contains("groupId cannot be null for group message"));
        verifyNoInteractions(messagePersistenceService);
    }

    @Test
    void persistMessageBatchShouldNotDegenerateToPerRecordWritesWhenLargeBatchContainsSingleDuplicate() {
        List<ConsumerRecord<String, MessageEvent>> records = new ArrayList<>(10_000);
        for (int i = 0; i < 10_000; i++) {
            long messageId = 10_000L + i;
            records.add(record(i % 4, i, "p_1_2", event(messageId, 1L, 2L, "client-" + messageId, "payload-" + i)));
        }
        List<Integer> batchSizes = new ArrayList<>();
        when(messagePersistenceService.persistIdempotentBatch(any())).thenAnswer(invocation -> {
            List<Message> messages = invocation.getArgument(0);
            batchSizes.add(messages.size());
            return resultFor(messages, Set.of(19_876L));
        });

        KafkaMessagePersistBatchResult result = persister.persistMessageBatch(records);

        assertEquals(10_000, result.getMessageCount());
        assertEquals(9_999, result.getSuccessCount());
        assertEquals(1, result.getDuplicateCount());
        assertEquals(0, result.getPoisonCount());
        assertEquals(0, result.getRetryableCount());
        assertTrue(batchSizes.size() < 100);
        assertTrue(batchSizes.stream().noneMatch(size -> size == 1));
    }

    @Test
    void persistMessageBatchShouldBinarySplitAndIsolateSingleBadRecordWithoutFullSingleRowFallback() {
        List<ConsumerRecord<String, MessageEvent>> records = new ArrayList<>();
        for (int i = 0; i < 16; i++) {
            long messageId = 60_001L + i;
            records.add(record(0, i, "p_1_2", event(messageId, 1L, 2L, "client-" + messageId, "payload-" + i)));
        }
        long badMessageId = 60_016L;
        List<Integer> batchSizes = new ArrayList<>();
        when(messagePersistenceService.persistIdempotentBatch(any())).thenAnswer(invocation -> {
            List<Message> messages = invocation.getArgument(0);
            batchSizes.add(messages.size());
            if (containsMessage(messages, badMessageId)) {
                throw new DataIntegrityViolationException("bad payload");
            }
            return insertedResult(messages);
        });

        KafkaMessagePersistBatchResult result = persister.persistMessageBatch(records);

        assertEquals(16, result.getMessageCount());
        assertEquals(15, result.getSuccessCount());
        assertEquals(0, result.getDuplicateCount());
        assertEquals(1, result.getPoisonCount());
        assertEquals(0, result.getRetryableCount());
        assertTrue(batchSizes.size() < 16);
        assertTrue(batchSizes.stream().filter(size -> size == 1).count() <= 2);
        verify(poisonRecordDltKafkaTemplate).send(eq("im-chat-topic.dlt"), eq(String.valueOf(badMessageId)), any());
        verify(acceptedMessageProjectionService, never()).markPersisted(argThat(event -> event != null && badMessageId == event.getMessageId()));
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

    private boolean containsMessage(List<Message> messages, long messageId) {
        return messages.stream().anyMatch(message -> message != null && Long.valueOf(messageId).equals(message.getId()));
    }

    private MessagePersistenceService.BatchPersistResult insertedResult(List<Message> messages) {
        return MessagePersistenceService.BatchPersistResult.inserted(messages == null ? 0 : messages.size());
    }

    private MessagePersistenceService.BatchPersistResult resultFor(List<Message> messages, Set<Long> duplicateMessageIds) {
        List<MessagePersistenceService.PersistDisposition> dispositions = new ArrayList<>(messages.size());
        for (Message message : messages) {
            if (message != null && duplicateMessageIds.contains(message.getId())) {
                dispositions.add(MessagePersistenceService.PersistDisposition.DUPLICATE);
            } else {
                dispositions.add(MessagePersistenceService.PersistDisposition.INSERTED);
            }
        }
        return new MessagePersistenceService.BatchPersistResult(dispositions);
    }

    private Message persistedMessage(Long messageId, Integer status, LocalDateTime updatedTime) {
        Message message = new Message();
        message.setId(messageId);
        message.setStatus(status);
        message.setUpdatedTime(updatedTime);
        return message;
    }
}
