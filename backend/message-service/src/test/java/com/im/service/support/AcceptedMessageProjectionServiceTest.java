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
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class AcceptedMessageProjectionServiceTest {

    @Mock
    private HotMessageRedisRepository hotMessageRedisRepository;

    @Mock
    private ConversationCacheUpdater conversationCacheUpdater;

    @Test
    void projectAcceptedShouldWriteCoreHotKeysBeforeConversationProjectionAndPendingMarker() {
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

        service.projectAccepted(event);

        InOrder inOrder = inOrder(hotMessageRedisRepository, conversationCacheUpdater);
        inOrder.verify(hotMessageRedisRepository).saveHotMessage(payload);
        inOrder.verify(hotMessageRedisRepository).saveClientMessageMapping(1L, "client-1", 1001L);
        inOrder.verify(conversationCacheUpdater).projectAcceptedMessage(event);
        inOrder.verify(hotMessageRedisRepository).addPendingPersistMessage(eq("p_1_2"), eq(1001L), any(LocalDateTime.class));
    }

    @Test
    void projectAcceptedShouldDerivePayloadWhenEventPayloadIsMissing() {
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

        service.projectAccepted(event);

        verify(hotMessageRedisRepository).saveHotMessage(org.mockito.ArgumentMatchers.argThat(message ->
                message != null
                        && Long.valueOf(2002L).equals(message.getId())
                        && "client-2".equals(message.getClientMessageId())
                        && Boolean.TRUE.equals(message.isGroup())
                        && Long.valueOf(8L).equals(message.getGroupId())));
    }
}
