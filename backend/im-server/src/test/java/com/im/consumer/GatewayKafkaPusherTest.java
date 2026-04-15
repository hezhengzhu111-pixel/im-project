package com.im.consumer;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.dto.ReadReceiptDTO;
import com.im.entity.UserSession;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
import com.im.feign.GroupServiceFeignClient;
import com.im.service.IImService;
import com.im.service.ProcessedMessageDeduplicator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.WebSocketSession;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GatewayKafkaPusherTest {

    @Mock
    private IImService imService;

    @Mock
    private RedisTemplate<String, Object> redisTemplate;

    @Mock
    private ValueOperations<String, Object> valueOperations;

    @Mock
    private GroupServiceFeignClient groupServiceFeignClient;

    @Mock
    private ProcessedMessageDeduplicator deduplicator;

    private GatewayKafkaPusher pusher;

    @BeforeEach
    void setUp() {
        pusher = new GatewayKafkaPusher(imService, redisTemplate, groupServiceFeignClient, deduplicator);
        ReflectionTestUtils.setField(pusher, "groupMembersCachePrefix", "message:group:members:");
        ReflectionTestUtils.setField(pusher, "groupMembersCacheTtlSeconds", 30L);
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        lenient().when(deduplicator.isProcessed(anyString())).thenReturn(false);
    }

    @Test
    void handleEvent_shouldPushPrivateMessageOnlyWhenReceiverHasLocalSession() {
        MessageDTO payload = privatePayload();
        MessageEvent event = privateEvent(payload);
        UserSession localSession = session("session-2");
        when(imService.getLocalSessions("2")).thenReturn(List.of(localSession));
        when(imService.pushMessageToUser(payload, 2L)).thenReturn(true);

        pusher.handleEvent(event);

        verify(imService).pushMessageToUser(payload, 2L);
        verify(deduplicator).markProcessed("kafka:MESSAGE:100:2");
        verifyNoInteractions(groupServiceFeignClient);
    }

    @Test
    void handleEvent_shouldDropPrivateMessageWhenReceiverIsNotLocal() {
        MessageEvent event = privateEvent(privatePayload());
        when(imService.getLocalSessions("2")).thenReturn(List.of());

        pusher.handleEvent(event);

        verify(imService, never()).pushMessageToUser(eq(event.getPayload()), eq(2L));
        verifyNoInteractions(groupServiceFeignClient);
    }

    @Test
    void handleEvent_shouldFanOutGroupMessageUsingRedisMembersAndLocalSessions() {
        MessageDTO payload = groupPayload();
        MessageEvent event = groupEvent(payload);
        UserSession localSession = session("session-2");
        when(valueOperations.get("message:group:members:9")).thenReturn(List.of(1L, 2L, 3L));
        when(imService.getLocalSessions("2")).thenReturn(List.of(localSession));
        when(imService.getLocalSessions("3")).thenReturn(List.of());
        when(imService.pushMessageToUser(payload, 2L)).thenReturn(true);

        pusher.handleEvent(event);

        verify(imService).pushMessageToUser(payload, 2L);
        verify(imService, never()).pushMessageToUser(payload, 3L);
        verify(groupServiceFeignClient, never()).memberIds(9L);
        verify(deduplicator).markProcessed("kafka:MESSAGE:101:2");
    }

    @Test
    void handleEvent_shouldFallbackToFeignAndBackfillRedisWhenGroupCacheMisses() {
        MessageDTO payload = groupPayload();
        MessageEvent event = groupEvent(payload);
        UserSession localSession = session("session-2");
        when(valueOperations.get("message:group:members:9")).thenReturn(null);
        when(groupServiceFeignClient.memberIds(9L)).thenReturn(List.of(1L, 2L));
        when(imService.getLocalSessions("2")).thenReturn(List.of(localSession));
        when(imService.pushMessageToUser(payload, 2L)).thenReturn(true);

        pusher.handleEvent(event);

        verify(groupServiceFeignClient).memberIds(9L);
        verify(valueOperations).set("message:group:members:9", List.of(1L, 2L), Duration.ofSeconds(30));
        verify(imService).pushMessageToUser(payload, 2L);
    }

    @Test
    void handleEvent_shouldPushReadReceiptToLocalSessionsWithKafkaEventType() {
        ReadReceiptDTO receipt = ReadReceiptDTO.builder()
                .conversationId("p_1_2")
                .readerId(1L)
                .toUserId(2L)
                .readAt(LocalDateTime.now())
                .lastReadMessageId(100L)
                .build();
        MessageEvent event = MessageEvent.builder()
                .eventType(MessageEventType.READ_SYNC)
                .messageId(100L)
                .conversationId("p_1_2")
                .senderId(1L)
                .receiverId(2L)
                .readReceiptPayload(receipt)
                .build();
        UserSession localSession = session("session-2");
        when(imService.getLocalSessions("2")).thenReturn(List.of(localSession));
        when(imService.pushReadReceiptToSession(receipt, "session-2", "READ_SYNC")).thenReturn(true);

        pusher.handleEvent(event);

        verify(imService).pushReadReceiptToSession(receipt, "session-2", "READ_SYNC");
        verify(deduplicator).markProcessed("kafka:READ_SYNC:100:2:session-2");
    }

    private MessageEvent privateEvent(MessageDTO payload) {
        return MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(100L)
                .conversationId("p_1_2")
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId("client-100")
                .messageType(MessageType.TEXT)
                .content("hello")
                .payload(payload)
                .build();
    }

    private MessageDTO privatePayload() {
        return MessageDTO.builder()
                .id(100L)
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .content("hello")
                .status("SENT")
                .isGroup(false)
                .build();
    }

    private MessageEvent groupEvent(MessageDTO payload) {
        return MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(101L)
                .conversationId("g_9")
                .senderId(1L)
                .groupId(9L)
                .messageType(MessageType.TEXT)
                .content("group hello")
                .group(true)
                .payload(payload)
                .build();
    }

    private MessageDTO groupPayload() {
        return MessageDTO.builder()
                .id(101L)
                .senderId(1L)
                .groupId(9L)
                .messageType(MessageType.TEXT)
                .content("group hello")
                .status("SENT")
                .isGroup(true)
                .build();
    }

    private UserSession session(String sessionId) {
        WebSocketSession webSocketSession = mock(WebSocketSession.class);
        lenient().when(webSocketSession.getId()).thenReturn(sessionId);
        return UserSession.builder().webSocketSession(webSocketSession).build();
    }
}
