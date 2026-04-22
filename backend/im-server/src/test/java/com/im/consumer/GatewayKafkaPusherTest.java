package com.im.consumer;

import com.im.dto.*;
import com.im.entity.UserSession;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
import com.im.feign.GroupServiceFeignClient;
import com.im.metrics.ImServerMetrics;
import com.im.service.IImService;
import com.im.service.ProcessedMessageDeduplicator;
import com.im.service.route.UserRouteRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.WebSocketSession;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
    @Mock
    private GroupServiceFeignClient groupServiceFeignClient;
    @Mock
    private UserRouteRegistry routeRegistry;
    @Mock
    private KafkaTemplate<String, Object> routedEventKafkaTemplate;

    private GatewayKafkaPusher pusher;
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        pusher = new GatewayKafkaPusher(
                imService,
                redisTemplate,
                deduplicator,
                groupServiceFeignClient,
                routeRegistry,
                routedEventKafkaTemplate
        );
        meterRegistry = new SimpleMeterRegistry();
        ReflectionTestUtils.setField(pusher, "metrics", new ImServerMetrics(meterRegistry));
        ReflectionTestUtils.setField(pusher, "groupMembersCachePrefix", "message:group:members:");
        ReflectionTestUtils.setField(pusher, "groupMembersCacheTtlSeconds", 30L);
        ReflectionTestUtils.setField(pusher, "chatTopic", "im-chat-topic");
        ReflectionTestUtils.setField(pusher, "readTopic", "im-read-topic");
        ReflectionTestUtils.setField(pusher, "statusTopic", "im-status-topic");
        ReflectionTestUtils.setField(pusher, "routeSendTimeoutMs", 1000L);
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        lenient().when(deduplicator.tryReserve(anyString())).thenReturn(true);
        lenient().when(imService.getCurrentInstanceId()).thenReturn("node-1");
        lenient().when(routedEventKafkaTemplate.send(any(ProducerRecord.class)))
                .thenReturn(CompletableFuture.completedFuture(null));
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
        verify(deduplicator).tryReserve("kafka:MESSAGE:100:1");
        verify(deduplicator).tryReserve("kafka:MESSAGE:100:2");
        verify(deduplicator, never()).release(anyString());
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
        verify(deduplicator, times(1)).tryReserve("kafka:MESSAGE:100:1");
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
        verify(deduplicator).tryReserve("kafka:MESSAGE:100:1");
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
        verify(deduplicator).tryReserve("kafka:MESSAGE:101:1");
        verify(deduplicator).tryReserve("kafka:MESSAGE:101:2");
        verify(deduplicator).tryReserve("kafka:MESSAGE:101:3");
    }

    @Test
    void handleEvent_shouldDropGroupMessageWhenGroupMemberCacheMisses() {
        MessageDTO payload = groupPayload(1L, 8L);
        MessageEvent event = groupEvent(payload, 1L, 8L);
        when(valueOperations.get("message:group:members:8")).thenReturn(null);
        when(groupServiceFeignClient.memberIds(8L)).thenReturn(List.of());

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
        when(deduplicator.tryReserve("kafka:MESSAGE:100:1")).thenReturn(false);
        when(imService.pushMessageToUser(payload, 2L)).thenReturn(true);

        pusher.handleEvent(event);

        verify(imService, never()).pushMessageToUser(payload, 1L);
        verify(imService).pushMessageToUser(payload, 2L);
        verify(deduplicator).tryReserve("kafka:MESSAGE:100:1");
        verify(deduplicator).tryReserve("kafka:MESSAGE:100:2");
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
        verify(deduplicator).tryReserve("kafka:READ_SYNC:100:2:session-2");
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
        verify(deduplicator).tryReserve("kafka:READ_RECEIPT:150:1:session-1");
        verify(deduplicator).tryReserve("kafka:READ_RECEIPT:150:2:session-2");
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
        verify(deduplicator).tryReserve("kafka:MESSAGE_STATUS_CHANGED:300:4:1");
        verify(deduplicator).tryReserve("kafka:MESSAGE_STATUS_CHANGED:300:4:2");
    }

    @Test
    void handleEvent_shouldReleaseReservationWhenSendThrowsAndAllowRetry() {
        MessageDTO payload = privatePayload(1L, 1L);
        MessageEvent event = privateEvent(payload, 1L, 1L);
        UserSession selfSession = session("session-1");
        when(imService.getLocalSessions("1")).thenReturn(List.of(selfSession));
        when(deduplicator.tryReserve("kafka:MESSAGE:100:1")).thenReturn(true, true);
        when(imService.pushMessageToUser(payload, 1L))
                .thenThrow(new RuntimeException("boom"))
                .thenReturn(true);

        pusher.handleEvent(event);
        pusher.handleEvent(event);

        verify(imService, times(2)).pushMessageToUser(payload, 1L);
        verify(deduplicator).release("kafka:MESSAGE:100:1");
    }

    @Test
    void handleEvent_shouldNotSendAgainAfterSuccessfulDelivery() {
        MessageDTO payload = privatePayload(1L, 1L);
        MessageEvent event = privateEvent(payload, 1L, 1L);
        UserSession selfSession = session("session-1");
        when(imService.getLocalSessions("1")).thenReturn(List.of(selfSession));
        when(deduplicator.tryReserve("kafka:MESSAGE:100:1")).thenReturn(true, false);
        when(imService.pushMessageToUser(payload, 1L)).thenReturn(true);

        pusher.handleEvent(event);
        pusher.handleEvent(event);

        verify(imService, times(1)).pushMessageToUser(payload, 1L);
        verify(deduplicator, never()).release("kafka:MESSAGE:100:1");
        assertEquals(1.0, meterRegistry.counter("duplicate_delivery_prevented").count());
    }

    @Test
    void handleEvent_shouldOnlySendOnceWhenConcurrentDeliveryKeyMatches() throws Exception {
        MessageDTO payload = privatePayload(1L, 1L);
        MessageEvent event = privateEvent(payload, 1L, 1L);
        UserSession selfSession = session("session-1");
        when(imService.getLocalSessions("1")).thenReturn(List.of(selfSession));

        AtomicBoolean reserved = new AtomicBoolean(false);
        CountDownLatch sendStarted = new CountDownLatch(1);
        CountDownLatch releaseSend = new CountDownLatch(1);
        when(deduplicator.tryReserve("kafka:MESSAGE:100:1"))
                .thenAnswer(invocation -> reserved.compareAndSet(false, true));
        when(imService.pushMessageToUser(payload, 1L)).thenAnswer(invocation -> {
            sendStarted.countDown();
            assertTrue(releaseSend.await(1, TimeUnit.SECONDS));
            return true;
        });

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<?> first = executor.submit(() -> awaitAndHandle(start, event));
            Future<?> second = executor.submit(() -> awaitAndHandle(start, event));

            start.countDown();
            assertTrue(sendStarted.await(1, TimeUnit.SECONDS));
            releaseSend.countDown();

            first.get(1, TimeUnit.SECONDS);
            second.get(1, TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
        }

        verify(imService, times(1)).pushMessageToUser(payload, 1L);
    }

    @Test
    void groupMembershipInvalidation_shouldEvictCacheAndReloadAuthoritativeMembersOnNextDelivery() {
        MessageDTO payload = groupPayload(1L, 8L);
        MessageEvent event = groupEvent(payload, 1L, 8L);
        UserSession senderSession = session("session-1");
        UserSession thirdSession = session("session-3");
        when(valueOperations.get("message:group:members:8")).thenReturn(null);
        when(groupServiceFeignClient.memberIds(8L)).thenReturn(List.of(1L, 3L));
        when(imService.getLocalSessions("1")).thenReturn(List.of(senderSession));
        when(imService.getLocalSessions("3")).thenReturn(List.of(thirdSession));
        when(imService.pushMessageToUser(payload, 1L)).thenReturn(true);
        when(imService.pushMessageToUser(payload, 3L)).thenReturn(true);

        pusher.onAuthorizationCacheInvalidation("""
                {"scope":"GROUP_MEMBERSHIP","changeType":"KICK","groupId":8,"userIds":[2]}
                """);
        pusher.handleEvent(event);

        verify(redisTemplate).delete("message:group:members:8");
        verify(groupServiceFeignClient).memberIds(8L);
        verify(valueOperations).set("message:group:members:8", List.of(1L, 3L), 30L, TimeUnit.SECONDS);
        verify(imService).pushMessageToUser(payload, 1L);
        verify(imService, never()).pushMessageToUser(payload, 2L);
        verify(imService).pushMessageToUser(payload, 3L);
    }

    @Test
    void duplicateInvalidation_shouldBeIdempotent() {
        String payload = """
                {"scope":"GROUP_MEMBERSHIP","changeType":"KICK","groupId":8,"userIds":[2]}
                """;

        pusher.onAuthorizationCacheInvalidation(payload);
        pusher.onAuthorizationCacheInvalidation(payload);

        verify(redisTemplate, times(2)).delete("message:group:members:8");
    }

    @Test
    void onMessage_shouldRouteOnlyToTargetInstanceAndOnlyThatInstanceShouldHandle() {
        MessageDTO payload = privatePayload(9L, 2L);
        MessageEvent event = privateEvent(payload, 9L, 2L);
        when(routeRegistry.getInstanceSessionCounts("9")).thenReturn(Map.of());
        when(routeRegistry.getInstanceSessionCounts("2")).thenReturn(Map.of("node-2", 1));

        pusher.onMessage(new ConsumerRecord<>("im-chat-topic", 0, 0L, "p_2_9", event));

        @SuppressWarnings("unchecked")
        org.mockito.ArgumentCaptor<ProducerRecord<String, Object>> captor =
                org.mockito.ArgumentCaptor.forClass((Class) ProducerRecord.class);
        verify(routedEventKafkaTemplate).send(captor.capture());
        ProducerRecord<String, Object> routedRecord = captor.getValue();
        assertEquals("im-chat-topic.route.node-2", routedRecord.topic());
        assertEquals("node-2", new String(
                routedRecord.headers().lastHeader(GatewayKafkaPusher.TARGET_INSTANCE_HEADER).value()));

        IImService node1ImService = mock(IImService.class);
        IImService node2ImService = mock(IImService.class);
        IImService node3ImService = mock(IImService.class);
        when(node1ImService.getCurrentInstanceId()).thenReturn("node-1");
        when(node2ImService.getCurrentInstanceId()).thenReturn("node-2");
        when(node3ImService.getCurrentInstanceId()).thenReturn("node-3");
        UserSession node2Session = session("session-node-2");
        when(node2ImService.getLocalSessions("2")).thenReturn(List.of(node2Session));
        when(node2ImService.pushMessageToUser(payload, 2L)).thenReturn(true);

        GatewayKafkaPusher node1Pusher = dispatcher(node1ImService, "node-1");
        GatewayKafkaPusher node2Pusher = dispatcher(node2ImService, "node-2");
        GatewayKafkaPusher node3Pusher = dispatcher(node3ImService, "node-3");

        ConsumerRecord<String, MessageEvent> dispatchRecord =
                new ConsumerRecord<>(routedRecord.topic(), 0, 0L, routedRecord.key(), event);
        dispatchRecord.headers().add(routedRecord.headers().lastHeader(GatewayKafkaPusher.TARGET_INSTANCE_HEADER));

        node1Pusher.onRoutedMessage(dispatchRecord);
        node2Pusher.onRoutedMessage(dispatchRecord);
        node3Pusher.onRoutedMessage(dispatchRecord);

        verify(node2ImService).pushMessageToUser(payload, 2L);
        verify(node1ImService, never()).pushMessageToUser(any(), anyLong());
        verify(node3ImService, never()).pushMessageToUser(any(), anyLong());
    }

    @Test
    void onMessage_shouldRemainCompatibleForSingleNodeRouting() {
        MessageDTO payload = privatePayload(1L, 2L);
        MessageEvent event = privateEvent(payload, 1L, 2L);
        when(routeRegistry.getInstanceSessionCounts("1")).thenReturn(Map.of("node-1", 1));
        when(routeRegistry.getInstanceSessionCounts("2")).thenReturn(Map.of("node-1", 1));
        UserSession senderSession = session("session-1");
        UserSession receiverSession = session("session-2");
        when(imService.getLocalSessions("1")).thenReturn(List.of(senderSession));
        when(imService.getLocalSessions("2")).thenReturn(List.of(receiverSession));
        when(imService.pushMessageToUser(payload, 1L)).thenReturn(true);
        when(imService.pushMessageToUser(payload, 2L)).thenReturn(true);

        pusher.onMessage(new ConsumerRecord<>("im-chat-topic", 0, 0L, "p_1_2", event));

        @SuppressWarnings("unchecked")
        org.mockito.ArgumentCaptor<ProducerRecord<String, Object>> captor =
                org.mockito.ArgumentCaptor.forClass((Class) ProducerRecord.class);
        verify(routedEventKafkaTemplate).send(captor.capture());
        ProducerRecord<String, Object> routedRecord = captor.getValue();
        ConsumerRecord<String, MessageEvent> dispatchRecord =
                new ConsumerRecord<>(routedRecord.topic(), 0, 0L, routedRecord.key(), event);
        dispatchRecord.headers().add(routedRecord.headers().lastHeader(GatewayKafkaPusher.TARGET_INSTANCE_HEADER));
        pusher.onRoutedMessage(dispatchRecord);

        verify(imService).pushMessageToUser(payload, 1L);
        verify(imService).pushMessageToUser(payload, 2L);
    }

    private void awaitAndHandle(CountDownLatch start, MessageEvent event) {
        try {
            assertTrue(start.await(1, TimeUnit.SECONDS));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new RuntimeException(exception);
        }
        pusher.handleEvent(event);
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

    private GatewayKafkaPusher dispatcher(IImService dispatcherImService, String instanceId) {
        GatewayKafkaPusher dispatcher = new GatewayKafkaPusher(
                dispatcherImService,
                redisTemplate,
                deduplicator,
                groupServiceFeignClient,
                routeRegistry,
                routedEventKafkaTemplate
        );
        ReflectionTestUtils.setField(dispatcher, "metrics", new ImServerMetrics(new SimpleMeterRegistry()));
        ReflectionTestUtils.setField(dispatcher, "groupMembersCachePrefix", "message:group:members:");
        ReflectionTestUtils.setField(dispatcher, "groupMembersCacheTtlSeconds", 30L);
        ReflectionTestUtils.setField(dispatcher, "chatTopic", "im-chat-topic");
        ReflectionTestUtils.setField(dispatcher, "readTopic", "im-read-topic");
        ReflectionTestUtils.setField(dispatcher, "statusTopic", "im-status-topic");
        ReflectionTestUtils.setField(dispatcher, "routeSendTimeoutMs", 1000L);
        when(dispatcherImService.getCurrentInstanceId()).thenReturn(instanceId);
        return dispatcher;
    }

    private UserSession session(String sessionId) {
        WebSocketSession webSocketSession = mock(WebSocketSession.class);
        lenient().when(webSocketSession.getId()).thenReturn(sessionId);
        return UserSession.builder().webSocketSession(webSocketSession).build();
    }
}
