package com.im.consumer;

import com.im.dto.*;
import com.im.entity.UserSession;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
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

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GatewayKafkaPusherTest {

    @Mock
    private IImService imService;

    @Mock
    private RedisTemplate<String, Object> redisTemplate;

    @Mock
    private ValueOperations<String, Object> valueOperations;

    @Mock
    private ProcessedMessageDeduplicator deduplicator;

    private GatewayKafkaPusher pusher;

    @BeforeEach
    void setUp() {
        pusher = new GatewayKafkaPusher(imService, redisTemplate, deduplicator);
        ReflectionTestUtils.setField(pusher, "groupMembersCachePrefix", "message:group:members:");
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        lenient().when(deduplicator.isProcessed(anyString())).thenReturn(false);
    }

    @Test
    void handleEvent_shouldPushPrivateMessageToReceiverAndSenderWhenBothHaveLocalSessions() {
        MessageDTO payload = privatePayload(1L, 2L);
        MessageEvent event = privateEvent(payload, 1L, 2L);
        UserSession senderSession = session("session-1");
        UserSession localSession = session("session-2");
        when(imService.getLocalSessions("1")).thenReturn(List.of(senderSession));
        when(imService.getLocalSessions("2")).thenReturn(List.of(localSession));
        when(imService.pushMessageToUser(payload, 1L)).thenReturn(true);
        when(imService.pushMessageToUser(payload, 2L)).thenReturn(true);

        pusher.handleEvent(event);

        verify(imService).pushMessageToUser(payload, 1L);
        verify(imService).pushMessageToUser(payload, 2L);
        verify(deduplicator).markProcessed("kafka:MESSAGE:100:1");
        verify(deduplicator).markProcessed("kafka:MESSAGE:100:2");
    }

    @Test
    void handleEvent_shouldPushPrivateMessageOnlyOnceWhenSenderEqualsReceiver() {
        MessageDTO payload = privatePayload(1L, 1L);
        MessageEvent event = privateEvent(payload, 1L, 1L);
        UserSession selfSession = session("session-1");
        when(imService.getLocalSessions("1")).thenReturn(List.of(selfSession));
        when(imService.pushMessageToUser(payload, 1L)).thenReturn(true);

        pusher.handleEvent(event);

        verify(imService, times(1)).pushMessageToUser(payload, 1L);
        verify(deduplicator, times(1)).markProcessed("kafka:MESSAGE:100:1");
    }

    @Test
    void handleEvent_shouldSkipPrivateTargetWithoutLocalSessionsButStillPushOtherParticipant() {
        MessageDTO payload = privatePayload(1L, 2L);
        MessageEvent event = privateEvent(payload, 1L, 2L);
        UserSession senderSession = session("session-1");
        when(imService.getLocalSessions("1")).thenReturn(List.of(senderSession));
        when(imService.getLocalSessions("2")).thenReturn(List.of());
        when(imService.pushMessageToUser(payload, 1L)).thenReturn(true);

        pusher.handleEvent(event);

        verify(imService).pushMessageToUser(payload, 1L);
        verify(imService, never()).pushMessageToUser(payload, 2L);
        verify(deduplicator).markProcessed("kafka:MESSAGE:100:1");
    }

    @Test
    void handleEvent_shouldFanOutGroupMessageToAllMembersIncludingSender() {
        MessageDTO payload = groupPayload(1L, 8L);
        MessageEvent event = groupEvent(payload, 1L, 8L);
        UserSession senderSession = session("session-1");
        UserSession localSession = session("session-2");
        UserSession thirdSession = session("session-3");
        when(valueOperations.get("message:group:members:8")).thenReturn(List.of(1L, 2L, 3L));
        when(imService.getLocalSessions("1")).thenReturn(List.of(senderSession));
        when(imService.getLocalSessions("2")).thenReturn(List.of(localSession));
        when(imService.getLocalSessions("3")).thenReturn(List.of(thirdSession));
        when(imService.pushMessageToUser(payload, 1L)).thenReturn(true);
        when(imService.pushMessageToUser(payload, 2L)).thenReturn(true);
        when(imService.pushMessageToUser(payload, 3L)).thenReturn(true);

        pusher.handleEvent(event);

        verify(imService).pushMessageToUser(payload, 1L);
        verify(imService).pushMessageToUser(payload, 2L);
        verify(imService).pushMessageToUser(payload, 3L);
        verify(deduplicator).markProcessed("kafka:MESSAGE:101:1");
        verify(deduplicator).markProcessed("kafka:MESSAGE:101:2");
        verify(deduplicator).markProcessed("kafka:MESSAGE:101:3");
    }

    @Test
    void handleEvent_shouldDropGroupMessageWhenGroupMemberCacheMisses() {
        MessageDTO payload = groupPayload(1L, 8L);
        MessageEvent event = groupEvent(payload, 1L, 8L);
        when(valueOperations.get("message:group:members:8")).thenReturn(null);

        pusher.handleEvent(event);

        verify(imService, never()).pushMessageToUser(payload, 2L);
    }

    @Test
    void handleEvent_shouldSkipGroupMembersWithoutLocalSessionsButStillPushOtherMembers() {
        MessageDTO payload = groupPayload(1L, 8L);
        MessageEvent event = groupEvent(payload, 1L, 8L);
        UserSession senderSession = session("session-1");
        UserSession receiverSession = session("session-3");
        when(valueOperations.get("message:group:members:8")).thenReturn(List.of(1L, 2L, 3L));
        when(imService.getLocalSessions("1")).thenReturn(List.of(senderSession));
        when(imService.getLocalSessions("2")).thenReturn(List.of());
        when(imService.getLocalSessions("3")).thenReturn(List.of(receiverSession));
        when(imService.pushMessageToUser(payload, 1L)).thenReturn(true);
        when(imService.pushMessageToUser(payload, 3L)).thenReturn(true);

        pusher.handleEvent(event);

        verify(imService).pushMessageToUser(payload, 1L);
        verify(imService, never()).pushMessageToUser(payload, 2L);
        verify(imService).pushMessageToUser(payload, 3L);
    }

    @Test
    void handleEvent_shouldRespectMessageDeduplicatorForSenderWhileStillPushingReceiver() {
        MessageDTO payload = privatePayload(1L, 2L);
        MessageEvent event = privateEvent(payload, 1L, 2L);
        UserSession senderSession = session("session-1");
        UserSession receiverSession = session("session-2");
        when(imService.getLocalSessions("1")).thenReturn(List.of(senderSession));
        when(imService.getLocalSessions("2")).thenReturn(List.of(receiverSession));
        when(deduplicator.isProcessed("kafka:MESSAGE:100:1")).thenReturn(true);
        when(imService.pushMessageToUser(payload, 2L)).thenReturn(true);

        pusher.handleEvent(event);

        verify(imService, never()).pushMessageToUser(payload, 1L);
        verify(imService).pushMessageToUser(payload, 2L);
        verify(deduplicator, never()).markProcessed("kafka:MESSAGE:100:1");
        verify(deduplicator).markProcessed("kafka:MESSAGE:100:2");
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

    @Test
    void handleReadEvent_shouldPushReceiptToReaderAndPeerLocalSessions() {
        ReadEvent event = ReadEvent.builder()
                .userId(1L)
                .targetUserId(2L)
                .conversationId("1_2")
                .lastReadMessageId(150L)
                .timestamp(LocalDateTime.now())
                .build();
        UserSession readerSession = session("session-1");
        UserSession peerSession = session("session-2");
        when(imService.getLocalSessions("1")).thenReturn(List.of(readerSession));
        when(imService.getLocalSessions("2")).thenReturn(List.of(peerSession));
        when(imService.pushReadReceiptToSession(any(ReadReceiptDTO.class), eq("session-1"), eq("READ_RECEIPT"))).thenReturn(true);
        when(imService.pushReadReceiptToSession(any(ReadReceiptDTO.class), eq("session-2"), eq("READ_RECEIPT"))).thenReturn(true);

        pusher.handleReadEvent(event);

        verify(imService).pushReadReceiptToSession(any(ReadReceiptDTO.class), eq("session-1"), eq("READ_RECEIPT"));
        verify(imService).pushReadReceiptToSession(any(ReadReceiptDTO.class), eq("session-2"), eq("READ_RECEIPT"));
        verify(deduplicator).markProcessed("kafka:READ_RECEIPT:150:1:session-1");
        verify(deduplicator).markProcessed("kafka:READ_RECEIPT:150:2:session-2");
    }

    @Test
    void handleStatusChangeEvent_shouldPushUpdatedPayloadToLocalParticipants() {
        MessageDTO payload = MessageDTO.builder()
                .id(300L)
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .content("hello")
                .status("RECALLED")
                .isGroup(false)
                .build();
        StatusChangeEvent event = StatusChangeEvent.builder()
                .messageId(300L)
                .conversationId("p_1_2")
                .senderId(1L)
                .receiverId(2L)
                .newStatus(4)
                .payload(payload)
                .build();
        UserSession senderSession = session("session-1");
        UserSession receiverSession = session("session-2");
        when(imService.getLocalSessions("1")).thenReturn(List.of(senderSession));
        when(imService.getLocalSessions("2")).thenReturn(List.of(receiverSession));
        when(imService.pushMessageToUser(payload, 1L)).thenReturn(true);
        when(imService.pushMessageToUser(payload, 2L)).thenReturn(true);

        pusher.handleStatusChangeEvent(event);

        verify(imService).pushMessageToUser(payload, 1L);
        verify(imService).pushMessageToUser(payload, 2L);
        verify(deduplicator).markProcessed("kafka:MESSAGE_STATUS_CHANGED:300:4:1");
        verify(deduplicator).markProcessed("kafka:MESSAGE_STATUS_CHANGED:300:4:2");
    }

    private MessageEvent privateEvent(MessageDTO payload, Long senderId, Long receiverId) {
        return MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(100L)
                .conversationId("p_" + Math.min(senderId, receiverId) + "_" + Math.max(senderId, receiverId))
                .senderId(senderId)
                .receiverId(receiverId)
                .clientMessageId("client-100")
                .messageType(MessageType.TEXT)
                .content("hello")
                .payload(payload)
                .build();
    }

    private MessageDTO privatePayload(Long senderId, Long receiverId) {
        return MessageDTO.builder()
                .id(100L)
                .senderId(senderId)
                .receiverId(receiverId)
                .messageType(MessageType.TEXT)
                .content("hello")
                .status("SENT")
                .isGroup(false)
                .build();
    }

    private MessageEvent groupEvent(MessageDTO payload, Long senderId, Long groupId) {
        return MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(101L)
                .conversationId("g_" + groupId)
                .senderId(senderId)
                .groupId(groupId)
                .messageType(MessageType.TEXT)
                .content("group hello")
                .group(true)
                .payload(payload)
                .build();
    }

    private MessageDTO groupPayload(Long senderId, Long groupId) {
        return MessageDTO.builder()
                .id(101L)
                .senderId(senderId)
                .groupId(groupId)
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
