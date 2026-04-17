package com.im.service.support;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
import com.im.mapper.AcceptedMessageMapper;
import com.im.mapper.MessageOutboxMapper;
import com.im.message.entity.AcceptedMessage;
import com.im.message.entity.MessageOutbox;
import com.im.service.ConversationCacheUpdater;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AcceptedMessageProjectionServiceTest {

    @Mock
    private HotMessageRedisRepository hotMessageRedisRepository;

    @Mock
    private ConversationCacheUpdater conversationCacheUpdater;

    @Mock
    private AcceptedMessageMapper acceptedMessageMapper;

    @Mock
    private MessageOutboxMapper messageOutboxMapper;

    @Test
    void projectAcceptedFirstSeenShouldWriteCoreHotKeysBeforeConversationProjectionAndPendingMarker() {
        AcceptedMessageProjectionService service = service();
        MessageDTO payload = MessageDTO.builder()
                .id(1001L)
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId("client-1")
                .messageType(MessageType.TEXT)
                .content("hello")
                .ackStage(MessageDTO.ACK_STAGE_ACCEPTED)
                .createdTime(LocalDateTime.of(2026, 4, 15, 20, 0))
                .build();
        MessageEvent event = MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(1001L)
                .conversationId("p_1_2")
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId("client-1")
                .clientMsgId("client-1")
                .messageType(MessageType.TEXT)
                .content("hello")
                .createdTime(payload.getCreatedTime())
                .payload(payload)
                .build();

        service.projectAcceptedFirstSeen(event);

        InOrder inOrder = inOrder(hotMessageRedisRepository, conversationCacheUpdater);
        inOrder.verify(hotMessageRedisRepository).saveHotMessage(payload);
        inOrder.verify(hotMessageRedisRepository).saveClientMessageMapping(1L, "client-1", 1001L);
        inOrder.verify(conversationCacheUpdater).applyFirstSeenAcceptedMessage(event);
        inOrder.verify(hotMessageRedisRepository).addPendingPersistMessage("p_1_2", 1001L, payload.getCreatedTime());
    }

    @Test
    void reserveAcceptedMessageShouldPersistAcceptedAndOutboxWithAcceptedAckStage() {
        AcceptedMessageProjectionService service = service();
        MessageEvent event = privateEvent(4004L, "client-4", "hello");

        MessageDTO result = service.reserveAcceptedMessage(event);

        assertNull(result);
        verify(acceptedMessageMapper).insert(argThat((AcceptedMessage accepted) ->
                accepted != null
                        && Long.valueOf(4004L).equals(accepted.getId())
                        && "client-4".equals(accepted.getClientMessageId())
                        && MessageDTO.ACK_STAGE_ACCEPTED.equals(accepted.getAckStage())));
        verify(messageOutboxMapper).insert(argThat((MessageOutbox outbox) ->
                outbox != null
                        && Long.valueOf(4004L).equals(outbox.getId())
                        && "client-4".equals(outbox.getClientMessageId())
                        && "PENDING".equals(outbox.getDispatchStatus())
                        && outbox.getEventJson() != null));
    }

    @Test
    void reserveAcceptedMessageShouldReturnExistingDurableSnapshotOnDuplicate() {
        AcceptedMessageProjectionService service = service();
        MessageEvent event = privateEvent(4004L, "client-4", "duplicate");
        AcceptedMessage stored = acceptedMessage(
                4001L,
                1L,
                "client-4",
                MessageDTO.ACK_STAGE_PERSISTED,
                acceptedPayloadJson(4001L, "client-4", "duplicate", MessageDTO.ACK_STAGE_ACCEPTED)
        );
        doThrow(new DuplicateKeyException("duplicate")).when(acceptedMessageMapper).insert(any(AcceptedMessage.class));
        when(acceptedMessageMapper.selectBySenderIdAndClientMessageId(1L, "client-4")).thenReturn(stored);

        MessageDTO result = service.reserveAcceptedMessage(event);

        assertNotNull(result);
        assertEquals(4001L, result.getId());
        assertEquals("client-4", result.getClientMessageId());
        assertEquals(MessageDTO.ACK_STAGE_PERSISTED, result.getAckStage());
        verify(messageOutboxMapper, never()).insert(any(MessageOutbox.class));
    }

    @Test
    void reserveAcceptedMessageShouldOnlyCreateOneAcceptedAndOneOutboxRecordUnderConcurrentDuplicateRequests() throws Exception {
        AcceptedMessageProjectionService service = service();
        AtomicReference<AcceptedMessage> storedAccepted = new AtomicReference<>();
        AtomicInteger acceptedInsertCount = new AtomicInteger();
        AtomicInteger outboxInsertCount = new AtomicInteger();
        doAnswer(invocation -> {
            AcceptedMessage candidate = copyAcceptedMessage(invocation.getArgument(0));
            if (storedAccepted.compareAndSet(null, candidate)) {
                acceptedInsertCount.incrementAndGet();
                return 1;
            }
            throw new DuplicateKeyException("duplicate");
        }).when(acceptedMessageMapper).insert(any(AcceptedMessage.class));
        doAnswer(invocation -> {
            outboxInsertCount.incrementAndGet();
            return 1;
        }).when(messageOutboxMapper).insert(any(MessageOutbox.class));
        when(acceptedMessageMapper.selectBySenderIdAndClientMessageId(1L, "client-concurrent"))
                .thenAnswer(invocation -> copyAcceptedMessage(storedAccepted.get()));

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executorService = Executors.newFixedThreadPool(2);
        try {
            Future<MessageDTO> first = executorService.submit(() -> reserveAfterBarrier(service, privateEvent(5001L, "client-concurrent", "hello"), ready, start));
            Future<MessageDTO> second = executorService.submit(() -> reserveAfterBarrier(service, privateEvent(5002L, "client-concurrent", "hello"), ready, start));

            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();

            MessageDTO firstResult = first.get(5, TimeUnit.SECONDS);
            MessageDTO secondResult = second.get(5, TimeUnit.SECONDS);

            assertEquals(1, acceptedInsertCount.get());
            assertEquals(1, outboxInsertCount.get());
            AcceptedMessage durableRecord = storedAccepted.get();
            assertNotNull(durableRecord);
            assertEquals("client-concurrent", durableRecord.getClientMessageId());
            assertEquals(1, java.util.stream.Stream.of(firstResult, secondResult).filter(Objects::isNull).count());
            MessageDTO duplicateResult = java.util.stream.Stream.of(firstResult, secondResult)
                    .filter(Objects::nonNull)
                    .findFirst()
                    .orElseThrow();
            assertEquals(durableRecord.getId(), duplicateResult.getId());
        } finally {
            executorService.shutdownNow();
        }
    }

    @Test
    void markPersistedShouldPromoteAcceptedSnapshotAndOutboxToPersistedStage() {
        AcceptedMessageProjectionService service = service();
        MessageEvent event = privateEvent(6006L, "client-6", "persisted");

        service.markPersisted(event);

        verify(acceptedMessageMapper).updateAckStageById(6006L, MessageDTO.ACK_STAGE_PERSISTED);
        verify(messageOutboxMapper).markPersistedById(6006L);
        verify(hotMessageRedisRepository).saveHotMessage(argThat(message ->
                message != null
                        && Long.valueOf(6006L).equals(message.getId())
                        && MessageDTO.ACK_STAGE_PERSISTED.equals(message.getAckStage())));
    }

    private AcceptedMessageProjectionService service() {
        AcceptedMessageProjectionService service =
                new AcceptedMessageProjectionService(hotMessageRedisRepository, conversationCacheUpdater, acceptedMessageMapper, messageOutboxMapper);
        ReflectionTestUtils.setField(service, "chatTopic", "im-chat-topic");
        return service;
    }

    private MessageDTO reserveAfterBarrier(AcceptedMessageProjectionService service,
                                           MessageEvent event,
                                           CountDownLatch ready,
                                           CountDownLatch start) throws Exception {
        ready.countDown();
        assertTrue(start.await(5, TimeUnit.SECONDS));
        return service.reserveAcceptedMessage(event);
    }

    private MessageEvent privateEvent(Long messageId, String clientMessageId, String content) {
        return MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(messageId)
                .conversationId("p_1_2")
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId(clientMessageId)
                .clientMsgId(clientMessageId)
                .messageType(MessageType.TEXT)
                .content(content)
                .createdTime(LocalDateTime.of(2026, 4, 15, 20, 20))
                .payload(MessageDTO.builder()
                        .id(messageId)
                        .senderId(1L)
                        .receiverId(2L)
                        .clientMessageId(clientMessageId)
                        .messageType(MessageType.TEXT)
                        .content(content)
                        .ackStage(MessageDTO.ACK_STAGE_ACCEPTED)
                        .createdTime(LocalDateTime.of(2026, 4, 15, 20, 20))
                        .build())
                .build();
    }

    private AcceptedMessage acceptedMessage(Long messageId,
                                            Long senderId,
                                            String clientMessageId,
                                            String ackStage,
                                            String payloadJson) {
        AcceptedMessage acceptedMessage = new AcceptedMessage();
        acceptedMessage.setId(messageId);
        acceptedMessage.setSenderId(senderId);
        acceptedMessage.setClientMessageId(clientMessageId);
        acceptedMessage.setConversationId("p_1_2");
        acceptedMessage.setAckStage(ackStage);
        acceptedMessage.setPayloadJson(payloadJson);
        acceptedMessage.setCreatedTime(LocalDateTime.of(2026, 4, 15, 20, 20));
        acceptedMessage.setUpdatedTime(LocalDateTime.of(2026, 4, 15, 20, 20));
        return acceptedMessage;
    }

    private AcceptedMessage copyAcceptedMessage(AcceptedMessage source) {
        if (source == null) {
            return null;
        }
        AcceptedMessage copy = new AcceptedMessage();
        copy.setId(source.getId());
        copy.setSenderId(source.getSenderId());
        copy.setClientMessageId(source.getClientMessageId());
        copy.setConversationId(source.getConversationId());
        copy.setAckStage(source.getAckStage());
        copy.setPayloadJson(source.getPayloadJson());
        copy.setCreatedTime(source.getCreatedTime());
        copy.setUpdatedTime(source.getUpdatedTime());
        return copy;
    }

    private String acceptedPayloadJson(Long messageId, String clientMessageId, String content, String ackStage) {
        return """
                {"id":%d,"senderId":1,"receiverId":2,"clientMessageId":"%s","messageType":"TEXT","content":"%s","createdTime":"2026-04-15T20:20:00","ackStage":"%s"}
                """.formatted(messageId, clientMessageId, content, ackStage);
    }
}
