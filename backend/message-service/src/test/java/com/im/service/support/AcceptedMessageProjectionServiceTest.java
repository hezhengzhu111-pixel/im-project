package com.im.service.support;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
import com.im.service.ConversationCacheUpdater;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AcceptedMessageProjectionServiceTest {

    @Mock
    private HotMessageRedisRepository hotMessageRedisRepository;

    @Mock
    private ConversationCacheUpdater conversationCacheUpdater;

    @Test
    void projectAcceptedFirstSeenShouldWriteCoreHotKeysBeforeConversationProjectionAndPendingMarker() {
        AcceptedMessageProjectionService service =
                new AcceptedMessageProjectionService(hotMessageRedisRepository, conversationCacheUpdater);
        MessageDTO payload = MessageDTO.builder()
                .id(1001L)
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId("client-1")
                .messageType(MessageType.TEXT)
                .content("hello")
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
        inOrder.verify(hotMessageRedisRepository).addPendingPersistMessage(
                eq("p_1_2"),
                eq(1001L),
                eq(payload.getCreatedTime())
        );
    }

    @Test
    void projectAcceptedFirstSeenShouldDerivePayloadWhenEventPayloadIsMissing() {
        AcceptedMessageProjectionService service =
                new AcceptedMessageProjectionService(hotMessageRedisRepository, conversationCacheUpdater);
        MessageEvent event = MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(2002L)
                .conversationId("g_8")
                .senderId(1L)
                .groupId(8L)
                .group(true)
                .clientMessageId("client-2")
                .messageType(MessageType.TEXT)
                .content("group hello")
                .createdTime(LocalDateTime.of(2026, 4, 15, 20, 5))
                .statusText("SENT")
                .build();

        service.projectAcceptedFirstSeen(event);

        verify(hotMessageRedisRepository).saveHotMessage(org.mockito.ArgumentMatchers.argThat(message ->
                message != null
                        && Long.valueOf(2002L).equals(message.getId())
                        && "client-2".equals(message.getClientMessageId())
                        && Boolean.TRUE.equals(message.isGroup())
                        && Long.valueOf(8L).equals(message.getGroupId())));
    }

    @Test
    void projectAcceptedFirstSeenShouldUsePayloadCreatedTimeWhenEventCreatedTimeIsMissing() {
        AcceptedMessageProjectionService service =
                new AcceptedMessageProjectionService(hotMessageRedisRepository, conversationCacheUpdater);
        LocalDateTime payloadCreatedTime = LocalDateTime.of(2026, 4, 15, 20, 6);
        MessageDTO payload = MessageDTO.builder()
                .id(2003L)
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId("client-3")
                .messageType(MessageType.TEXT)
                .content("payload time")
                .createdTime(payloadCreatedTime)
                .build();
        MessageEvent event = MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(2003L)
                .conversationId("p_1_2")
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId("client-3")
                .messageType(MessageType.TEXT)
                .content("payload time")
                .payload(payload)
                .build();

        service.projectAcceptedFirstSeen(event);

        verify(hotMessageRedisRepository).addPendingPersistMessage("p_1_2", 2003L, payloadCreatedTime);
    }

    @Test
    void rehydrateAcceptedProjectionShouldRestoreHotKeysWithoutPendingOrFirstSeenEffects() {
        AcceptedMessageProjectionService service =
                new AcceptedMessageProjectionService(hotMessageRedisRepository, conversationCacheUpdater);
        MessageDTO message = MessageDTO.builder()
                .id(3003L)
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId("client-3")
                .messageType(MessageType.TEXT)
                .content("rehydrate")
                .createdTime(LocalDateTime.of(2026, 4, 15, 20, 10))
                .build();

        service.rehydrateAcceptedProjection(message);

        InOrder inOrder = inOrder(hotMessageRedisRepository, conversationCacheUpdater);
        inOrder.verify(hotMessageRedisRepository).saveHotMessage(message);
        inOrder.verify(hotMessageRedisRepository).saveClientMessageMapping(1L, "client-3", 3003L);
        inOrder.verify(conversationCacheUpdater).rehydrateAcceptedMessage(message);
        verify(hotMessageRedisRepository, never()).addPendingPersistMessage(any(), any(), any());
        verify(conversationCacheUpdater, never()).applyFirstSeenAcceptedMessage(any());
    }
}
