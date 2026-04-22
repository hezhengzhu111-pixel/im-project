package com.im.service.impl;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.im.config.ImNodeIdentity;
import com.im.dto.MessageDTO;
import com.im.dto.PresenceEvent;
import com.im.entity.UserSession;
import com.im.enums.MessageType;
import com.im.enums.UserStatus;
import com.im.metrics.ImServerMetrics;
import com.im.service.presence.PresenceTransitionDeduplicator;
import com.im.service.route.UserRouteRegistry;
import com.im.websocket.WebSocketErrorSemantics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.slf4j.LoggerFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ImServiceImplTest {

    @Mock
    private RedissonClient redissonClient;

    @Mock
    private ImNodeIdentity nodeIdentity;

    @Mock
    private UserRouteRegistry routeRegistry;

    @Mock
    private PresenceTransitionDeduplicator presenceTransitionDeduplicator;

    @Mock
    private RTopic presenceTopic;

    private ImServiceImpl imService;
    private SimpleMeterRegistry meterRegistry;
    private ListAppender<ILoggingEvent> appender;

    @BeforeEach
    void setUp() {
        imService = new ImServiceImpl(redissonClient, nodeIdentity, routeRegistry, presenceTransitionDeduplicator);
        meterRegistry = new SimpleMeterRegistry();
        ReflectionTestUtils.setField(imService, "metrics", new ImServerMetrics(meterRegistry));
        ReflectionTestUtils.setField(imService, "presenceChannel", "im:presence:broadcast");
        ReflectionTestUtils.setField(imService, "presenceOfflineGraceMs", 0L);
        ReflectionTestUtils.setField(imService, "heartbeatTimeoutMs", 90000L);
        ReflectionTestUtils.setField(imService, "sendDispatchTimeoutMs", 1000L);
        ReflectionTestUtils.setField(imService, "outboundMailboxCapacity", 8);
        ReflectionTestUtils.setField(imService, "outboundSendFailureThreshold", 3);
        ReflectionTestUtils.setField(imService, "outboundSendTimeoutThreshold", 3);

        lenient().when(nodeIdentity.getInstanceId()).thenReturn("im-node-1");
        lenient().when(redissonClient.getTopic("im:presence:broadcast")).thenReturn(presenceTopic);
        lenient().when(routeRegistry.isUserGloballyOnline(anyString())).thenReturn(false);
        lenient().when(presenceTransitionDeduplicator.tryTransition(anyString(), any(UserStatus.class))).thenReturn(true);

        imService.init();
    }

    @org.junit.jupiter.api.AfterEach
    void tearDown() {
        if (appender != null) {
            detachListAppender(appender);
            appender = null;
        }
        imService.destroy();
    }

    @Test
    void registerSession_shouldCreateLeaseAndRouteOnFirstLocalConnection() throws Exception {
        when(routeRegistry.isUserGloballyOnline("1")).thenReturn(false, true);
        WebSocketSession webSocketSession = mockOpenSession("session-1");
        UserSession userSession = UserSession.builder().webSocketSession(webSocketSession).build();

        imService.registerSession("1", userSession);

        verify(routeRegistry).upsertLocalRoute("1", "im-node-1", 1);
        verify(presenceTransitionDeduplicator).tryTransition("1", UserStatus.ONLINE);
        assertTrue(imService.isSessionActive("1", "session-1"));
        assertNotNull(userSession.getLastHeartbeat());
        assertTrue(imService.getLocallyOnlineUserIds().contains("1"));
        assertGaugeValue("im.websocket.connections.current", 1.0);
        assertGaugeValue("im.websocket.users.local", 1.0);
        verify(presenceTopic).publish(argThat(event -> {
            PresenceEvent presenceEvent = (PresenceEvent) event;
            return "1".equals(presenceEvent.getUserId())
                    && "ONLINE".equals(presenceEvent.getStatus())
                    && "im-node-1".equals(presenceEvent.getSourceInstanceId());
        }));
    }

    @Test
    void registerSession_shouldRefreshRouteWhenOnlyStaleLocalSessionExists() throws Exception {
        WebSocketSession staleWebSocketSession = mockOpenSession("session-1");
        UserSession staleSession = UserSession.builder().webSocketSession(staleWebSocketSession).build();
        imService.registerSession("1", staleSession);
        staleSession.setLastHeartbeat(LocalDateTime.now().minusMinutes(10));
        clearInvocations(routeRegistry, presenceTopic, presenceTransitionDeduplicator);
        when(routeRegistry.isUserGloballyOnline("1")).thenReturn(false, true);

        WebSocketSession freshWebSocketSession = mockOpenSession("session-2");
        imService.registerSession("1", UserSession.builder().webSocketSession(freshWebSocketSession).build());

        verify(routeRegistry).upsertLocalRoute("1", "im-node-1", 1);
        verify(presenceTransitionDeduplicator).tryTransition("1", UserStatus.ONLINE);
        verify(presenceTopic).publish(argThat(event -> {
            PresenceEvent presenceEvent = (PresenceEvent) event;
            return "1".equals(presenceEvent.getUserId())
                    && "ONLINE".equals(presenceEvent.getStatus())
                    && "im-node-1".equals(presenceEvent.getSourceInstanceId());
        }));
        assertTrue(imService.isSessionActive("1", "session-2"));
    }

    @Test
    void unregisterSession_shouldRemoveLeaseAndRouteWhenLastLocalSessionCloses() throws Exception {
        when(routeRegistry.isUserGloballyOnline("1")).thenReturn(false, true);
        WebSocketSession webSocketSession = mockOpenSession("session-1");
        UserSession userSession = UserSession.builder().webSocketSession(webSocketSession).build();
        imService.registerSession("1", userSession);
        clearInvocations(routeRegistry, webSocketSession, presenceTopic, presenceTransitionDeduplicator);
        when(routeRegistry.isUserGloballyOnline("1")).thenReturn(true, false);

        boolean removed = imService.unregisterSession("1", "session-1", CloseStatus.NORMAL);

        assertTrue(removed);
        verify(routeRegistry).removeLocalRoute("1", "im-node-1");
        verify(presenceTransitionDeduplicator).tryTransition("1", UserStatus.OFFLINE);
        verify(webSocketSession).close(CloseStatus.NORMAL);
        verify(presenceTopic).publish(argThat(event -> {
            PresenceEvent presenceEvent = (PresenceEvent) event;
            return "1".equals(presenceEvent.getUserId())
                    && "OFFLINE".equals(presenceEvent.getStatus())
                    && "im-node-1".equals(presenceEvent.getSourceInstanceId());
        }));
        assertFalse(imService.isSessionActive("1", "session-1"));
        assertGaugeValue("im.websocket.connections.current", 0.0);
        assertGaugeValue("im.websocket.users.local", 0.0);
    }

    @Test
    void unregisterSession_shouldKeepUserOnlineWhenAnotherLocalSessionExists() throws Exception {
        WebSocketSession firstSession = mockOpenSession("session-1");
        WebSocketSession secondSession = mockOpenSession("session-2");
        imService.registerSession("1", UserSession.builder().webSocketSession(firstSession).build());
        imService.registerSession("1", UserSession.builder().webSocketSession(secondSession).build());
        clearInvocations(routeRegistry, firstSession, secondSession, presenceTopic, presenceTransitionDeduplicator);

        boolean removed = imService.unregisterSession("1", "session-1", CloseStatus.NORMAL);

        assertTrue(removed);
        verify(routeRegistry).renewLocalRoute("1", "im-node-1", 1);
        verify(routeRegistry, never()).removeLocalRoute("1", "im-node-1");
        verify(presenceTransitionDeduplicator, never()).tryTransition(eq("1"), eq(UserStatus.OFFLINE));
        verify(firstSession).close(CloseStatus.NORMAL);
        verify(secondSession, never()).close(any(CloseStatus.class));
        verify(secondSession, never()).close();
        verify(presenceTopic, never()).publish(any());
        assertFalse(imService.isSessionActive("1", "session-1"));
        assertTrue(imService.isSessionActive("1", "session-2"));
        assertGaugeValue("im.websocket.connections.current", 1.0);
        assertGaugeValue("im.websocket.users.local", 1.0);
    }

    @Test
    void touchUserHeartbeat_shouldOnlyRefreshLocalState() throws Exception {
        WebSocketSession webSocketSession = mockOpenSession("session-1");
        UserSession userSession = UserSession.builder().webSocketSession(webSocketSession).build();
        imService.registerSession("1", userSession);
        clearInvocations(routeRegistry, presenceTransitionDeduplicator);

        boolean touched = imService.touchUserHeartbeat("1");

        assertTrue(touched);
        verify(routeRegistry).renewLocalRoute("1", "im-node-1", 1);
        verify(presenceTransitionDeduplicator, never()).tryTransition(anyString(), any(UserStatus.class));
    }

    @Test
    void pushMessageToSession_shouldOnlyRemoveSessionAfterConsecutiveSendFailuresReachThreshold() throws Exception {
        ReflectionTestUtils.setField(imService, "outboundSendFailureThreshold", 2);
        WebSocketSession failingSession = mockOpenSession("session-1");
        WebSocketSession healthySession = mockOpenSession("session-2");
        imService.registerSession("1", UserSession.builder().webSocketSession(failingSession).build());
        imService.registerSession("1", UserSession.builder().webSocketSession(healthySession).build());
        clearInvocations(routeRegistry, failingSession, healthySession, presenceTransitionDeduplicator);
        AtomicInteger failureCount = new AtomicInteger();
        doAnswer(invocation -> {
            failureCount.incrementAndGet();
            throw new IOException("send busy");
        }).when(failingSession).sendMessage(any());
        MessageDTO message = MessageDTO.builder()
                .senderId(2L)
                .receiverId(1L)
                .messageType(MessageType.TEXT)
                .content("hello")
                .build();

        assertTrue(imService.pushMessageToSession(message, "session-1"));
        awaitCondition(() -> failureCount.get() >= 1, 2_000L);

        assertTrue(imService.isSessionActive("1", "session-2"));
        assertTrue(imService.isSessionActive("1", "session-1"));
        verify(failingSession, never()).close(any(CloseStatus.class));
        verify(routeRegistry, never()).removeLocalRoute(anyString(), anyString());

        assertTrue(imService.pushMessageToSession(message, "session-1"));
        awaitCondition(() -> !imService.isSessionActive("1", "session-1"), 2_000L);

        verify(failingSession).close(argThat(status -> status.getCode() == CloseStatus.SESSION_NOT_RELIABLE.getCode()
                && WebSocketErrorSemantics.SESSION_ERROR_CODE.equals(status.getReason())));
        verify(healthySession, never()).close(any(CloseStatus.class));
        verify(healthySession, never()).close();
        verify(routeRegistry).renewLocalRoute("1", "im-node-1", 1);
        verify(routeRegistry, never()).removeLocalRoute(anyString(), anyString());
        verify(presenceTransitionDeduplicator, never()).tryTransition(eq("1"), eq(UserStatus.OFFLINE));
        assertFalse(imService.isSessionActive("1", "session-1"));
        assertTrue(imService.isSessionActive("1", "session-2"));
        awaitCondition(() -> pushCount("failure", "MESSAGE") >= 2.0, 2_000L);
        assertEquals(2.0, pushCount("failure", "MESSAGE"));
        assertEquals(2L, meterRegistry.get("im.websocket.push.duration")
                .tag("result", "failure")
                .tag("type", "MESSAGE")
                .timer()
                .count());
    }

    @Test
    void pushMessageToUser_shouldNotBlockFastSessionBehindSlowSession() throws Exception {
        ReflectionTestUtils.setField(imService, "sendDispatchTimeoutMs", 200L);
        WebSocketSession slowSession = mockOpenSession("session-1");
        WebSocketSession fastSession = mockOpenSession("session-2");
        imService.registerSession("1", UserSession.builder().webSocketSession(slowSession).build());
        imService.registerSession("1", UserSession.builder().webSocketSession(fastSession).build());
        clearInvocations(routeRegistry, slowSession, fastSession, presenceTopic, presenceTransitionDeduplicator);

        CountDownLatch slowSendEntered = new CountDownLatch(1);
        CountDownLatch releaseSlowSend = new CountDownLatch(1);
        CountDownLatch fastSendEntered = new CountDownLatch(1);
        org.mockito.Mockito.doAnswer(invocation -> {
            slowSendEntered.countDown();
            await(releaseSlowSend);
            return null;
        }).when(slowSession).sendMessage(any());
        org.mockito.Mockito.doAnswer(invocation -> {
            fastSendEntered.countDown();
            return null;
        }).when(fastSession).sendMessage(any());

        MessageDTO message = MessageDTO.builder()
                .id(101L)
                .senderId(2L)
                .receiverId(1L)
                .messageType(MessageType.TEXT)
                .content("hello")
                .build();

        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<Boolean> sendFuture = executor.submit(() -> imService.pushMessageToUser(message, 1L));

            assertTrue(slowSendEntered.await(2, TimeUnit.SECONDS));
            assertTrue(fastSendEntered.await(200, TimeUnit.MILLISECONDS));

            releaseSlowSend.countDown();
            assertTrue(sendFuture.get(2, TimeUnit.SECONDS));
            verify(slowSession).sendMessage(any());
            verify(fastSession).sendMessage(any());
        } finally {
            releaseSlowSend.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void pushMessageToSession_shouldCleanupMapsAndRouteRegistryAfterFailureThresholdReached() throws Exception {
        ReflectionTestUtils.setField(imService, "outboundSendFailureThreshold", 2);
        WebSocketSession failingSession = mockOpenSession("session-1");
        imService.registerSession("1", UserSession.builder().webSocketSession(failingSession).build());
        clearInvocations(routeRegistry, failingSession, presenceTopic, presenceTransitionDeduplicator);
        doThrow(new IOException("broken pipe")).when(failingSession).sendMessage(any());

        MessageDTO message = MessageDTO.builder()
                .senderId(2L)
                .receiverId(1L)
                .messageType(MessageType.TEXT)
                .content("hello")
                .build();

        assertTrue(imService.pushMessageToSession(message, "session-1"));
        awaitCondition(() -> pushCount("failure", "MESSAGE") >= 1.0, 2_000L);
        assertTrue(imService.isSessionActive("1", "session-1"));

        assertTrue(imService.pushMessageToSession(message, "session-1"));
        awaitCondition(() -> !imService.isSessionActive("1", "session-1"), 2_000L);

        verify(failingSession).close(argThat(status -> status.getCode() == CloseStatus.SESSION_NOT_RELIABLE.getCode()
                && WebSocketErrorSemantics.SESSION_ERROR_CODE.equals(status.getReason())));
        verify(routeRegistry).removeLocalRoute("1", "im-node-1");
        assertTrue(imService.getSessionsById().isEmpty());
        assertTrue(imService.getLocalSessions("1").isEmpty());
        assertFalse(imService.getLocallyOnlineUserIds().contains("1"));
        @SuppressWarnings("unchecked")
        Map<String, Set<String>> sessionIdsByUser =
                (Map<String, Set<String>>) ReflectionTestUtils.getField(imService, "sessionIdsByUser");
        assertNotNull(sessionIdsByUser);
        assertFalse(sessionIdsByUser.containsKey("1"));
    }

    @Test
    void pushMessageToSession_shouldPreservePerSessionMessageOrder() throws Exception {
        WebSocketSession session = mockOpenSession("session-1");
        CopyOnWriteArrayList<String> payloads = new CopyOnWriteArrayList<>();
        CountDownLatch sentLatch = new CountDownLatch(2);
        doAnswer(invocation -> {
            TextMessage textMessage = invocation.getArgument(0);
            payloads.add(textMessage.getPayload());
            sentLatch.countDown();
            return null;
        }).when(session).sendMessage(any());
        imService.registerSession("1", UserSession.builder().webSocketSession(session).build());

        MessageDTO first = MessageDTO.builder()
                .id(1L)
                .senderId(2L)
                .receiverId(1L)
                .messageType(MessageType.TEXT)
                .content("first")
                .build();
        MessageDTO second = MessageDTO.builder()
                .id(2L)
                .senderId(2L)
                .receiverId(1L)
                .messageType(MessageType.TEXT)
                .content("second")
                .build();

        assertTrue(imService.pushMessageToSession(first, "session-1"));
        assertTrue(imService.pushMessageToSession(second, "session-1"));
        assertTrue(sentLatch.await(2, TimeUnit.SECONDS));

        assertEquals(2, payloads.size());
        assertTrue(payloads.get(0).contains("\"content\":\"first\""));
        assertTrue(payloads.get(1).contains("\"content\":\"second\""));
    }

    @Test
    void pushMessageToSession_shouldNotKickHealthySessionWhenMailboxIsTemporarilyFull() throws Exception {
        ReflectionTestUtils.setField(imService, "outboundMailboxCapacity", 1);
        WebSocketSession session = mockOpenSession("session-1");
        CountDownLatch firstSendEntered = new CountDownLatch(1);
        CountDownLatch releaseFirstSend = new CountDownLatch(1);
        CountDownLatch secondSendCompleted = new CountDownLatch(1);
        AtomicInteger sendCount = new AtomicInteger();
        doAnswer(invocation -> {
            int current = sendCount.incrementAndGet();
            if (current == 1) {
                firstSendEntered.countDown();
                await(releaseFirstSend);
            } else {
                secondSendCompleted.countDown();
            }
            return null;
        }).when(session).sendMessage(any());
        imService.registerSession("1", UserSession.builder().webSocketSession(session).build());

        MessageDTO first = MessageDTO.builder().senderId(2L).receiverId(1L).messageType(MessageType.TEXT).content("first").build();
        MessageDTO second = MessageDTO.builder().senderId(2L).receiverId(1L).messageType(MessageType.TEXT).content("second").build();
        MessageDTO third = MessageDTO.builder().senderId(2L).receiverId(1L).messageType(MessageType.TEXT).content("third").build();

        assertTrue(imService.pushMessageToSession(first, "session-1"));
        assertTrue(firstSendEntered.await(2, TimeUnit.SECONDS));
        assertTrue(imService.pushMessageToSession(second, "session-1"));
        assertFalse(imService.pushMessageToSession(third, "session-1"));
        assertTrue(imService.isSessionActive("1", "session-1"));
        verify(session, never()).close(any(CloseStatus.class));

        releaseFirstSend.countDown();
        assertTrue(secondSendCompleted.await(2, TimeUnit.SECONDS));
        assertTrue(imService.isSessionActive("1", "session-1"));
    }

    @Test
    void broadcastOnlineStatus_shouldAllowBusinessMessageThroughBroadcastPressure() throws Exception {
        ReflectionTestUtils.setField(imService, "outboundMailboxCapacity", 2);
        WebSocketSession session = mockOpenSession("session-1");
        CountDownLatch firstBroadcastEntered = new CountDownLatch(1);
        CountDownLatch releaseFirstBroadcast = new CountDownLatch(1);
        CopyOnWriteArrayList<String> payloads = new CopyOnWriteArrayList<>();
        doAnswer(invocation -> {
            TextMessage textMessage = invocation.getArgument(0);
            payloads.add(textMessage.getPayload());
            if (payloads.size() == 1) {
                firstBroadcastEntered.countDown();
                await(releaseFirstBroadcast);
            }
            return null;
        }).when(session).sendMessage(any());
        imService.registerSession("1", UserSession.builder().webSocketSession(session).build());

        imService.broadcastOnlineStatus("2", UserStatus.ONLINE, "t1");
        assertTrue(firstBroadcastEntered.await(2, TimeUnit.SECONDS));
        imService.broadcastOnlineStatus("2", UserStatus.OFFLINE, "t2");
        imService.broadcastOnlineStatus("2", UserStatus.ONLINE, "t3");

        MessageDTO business = MessageDTO.builder()
                .id(9L)
                .senderId(2L)
                .receiverId(1L)
                .messageType(MessageType.TEXT)
                .content("priority-message")
                .build();
        assertTrue(imService.pushMessageToSession(business, "session-1"));

        releaseFirstBroadcast.countDown();
        awaitCondition(() -> payloads.size() >= 3, 2_000L);
        Thread.sleep(100L);

        assertEquals(3, payloads.size());
        assertTrue(payloads.get(0).contains("\"type\":\"ONLINE_STATUS\""));
        assertTrue(payloads.get(1).contains("\"type\":\"ONLINE_STATUS\""));
        assertTrue(payloads.get(2).contains("\"type\":\"MESSAGE\""));
        assertTrue(payloads.get(2).contains("priority-message"));
    }

    @Test
    void unregisterSession_shouldCleanupOutboundMailbox() throws Exception {
        WebSocketSession session = mockOpenSession("session-1");
        imService.registerSession("1", UserSession.builder().webSocketSession(session).build());

        @SuppressWarnings("unchecked")
        Map<String, Object> outboundMailboxes =
                (Map<String, Object>) ReflectionTestUtils.getField(imService, "outboundMailboxes");
        assertNotNull(outboundMailboxes);
        assertTrue(outboundMailboxes.containsKey("session-1"));

        assertTrue(imService.unregisterSession("1", "session-1", CloseStatus.NORMAL));

        assertFalse(outboundMailboxes.containsKey("session-1"));
    }

    @Test
    void pushMessageToUser_shouldNotLogMessageContent() throws Exception {
        WebSocketSession webSocketSession = mockOpenSession("session-1");
        imService.registerSession("1", UserSession.builder().webSocketSession(webSocketSession).build());
        clearInvocations(routeRegistry, presenceTopic, webSocketSession, presenceTransitionDeduplicator);

        MessageDTO message = MessageDTO.builder()
                .id(88L)
                .senderId(2L)
                .receiverId(1L)
                .messageType(MessageType.TEXT)
                .content("top-secret-message-content")
                .build();
        appender = attachListAppender();
        try {
            boolean success = imService.pushMessageToUser(message, 1L);

            assertTrue(success);
            String joinedLogs = joinedMessages(appender);
            assertFalse(joinedLogs.contains("top-secret-message-content"));
            assertTrue(joinedLogs.contains("messageId=88"));
            assertTrue(joinedLogs.contains("conversationId=p_1_2"));
            assertTrue(joinedLogs.contains("targetUserId=1"));
            assertTrue(joinedLogs.contains("resultCode=OK"));
        } finally {
            detachListAppender(appender);
        }
    }

    @Test
    void checkUsersOnlineStatus_shouldUseRouteRegistry() {
        when(routeRegistry.isUserGloballyOnline("1")).thenReturn(true);

        Map<String, Boolean> result = imService.checkUsersOnlineStatus(List.of("1"));

        assertTrue(result.get("1"));
        verify(routeRegistry).isUserGloballyOnline("1");
    }

    @Test
    void unregisterSession_shouldKeepUserOnlineWhenAnotherInstanceStillActive() throws Exception {
        WebSocketSession webSocketSession = mockOpenSession("session-1");
        imService.registerSession("1", UserSession.builder().webSocketSession(webSocketSession).build());
        when(routeRegistry.isUserGloballyOnline("1")).thenReturn(true);
        clearInvocations(routeRegistry, webSocketSession, presenceTopic, presenceTransitionDeduplicator);

        boolean removed = imService.unregisterSession("1", "session-1", CloseStatus.NORMAL);

        assertTrue(removed);
        verify(routeRegistry).removeLocalRoute("1", "im-node-1");
        verify(webSocketSession).close(CloseStatus.NORMAL);
        verify(presenceTransitionDeduplicator, never()).tryTransition(eq("1"), eq(UserStatus.OFFLINE));
        verify(presenceTopic, never()).publish(any());
    }

    @Test
    void registerAndUnregisterMultipleLocalSessions_shouldOnlyBroadcastOneOnlineAndOneOffline() throws Exception {
        when(routeRegistry.isUserGloballyOnline("1")).thenReturn(false, true, true, false);
        WebSocketSession firstSession = mockOpenSession("session-1");
        WebSocketSession secondSession = mockOpenSession("session-2");

        imService.registerSession("1", UserSession.builder().webSocketSession(firstSession).build());
        imService.registerSession("1", UserSession.builder().webSocketSession(secondSession).build());
        imService.unregisterSession("1", "session-1", CloseStatus.NORMAL);
        imService.unregisterSession("1", "session-2", CloseStatus.NORMAL);

        verify(presenceTransitionDeduplicator, times(1)).tryTransition("1", UserStatus.ONLINE);
        verify(presenceTransitionDeduplicator, times(1)).tryTransition("1", UserStatus.OFFLINE);
        verify(presenceTopic, times(2)).publish(any());
        assertEquals(1.0, meterRegistry.counter("route_registry_state_transitions", "transition", "online").count());
        assertEquals(1.0, meterRegistry.counter("route_registry_state_transitions", "transition", "offline").count());
    }

    @Test
    void registerSession_shouldNotBroadcastOnlineWhenAnotherInstanceAlreadyOnline() throws Exception {
        when(routeRegistry.isUserGloballyOnline("1")).thenReturn(true);
        WebSocketSession webSocketSession = mockOpenSession("session-1");

        imService.registerSession("1", UserSession.builder().webSocketSession(webSocketSession).build());

        verify(routeRegistry).upsertLocalRoute("1", "im-node-1", 1);
        verify(presenceTransitionDeduplicator, never()).tryTransition(eq("1"), eq(UserStatus.ONLINE));
        verify(presenceTopic, never()).publish(any());
    }

    @Test
    void unregisterAndQuickReconnect_shouldNotBroadcastOfflineOrSecondOnline() throws Exception {
        ReflectionTestUtils.setField(imService, "presenceOfflineGraceMs", 120L);
        when(routeRegistry.isUserGloballyOnline("1")).thenReturn(false, true);
        WebSocketSession firstSession = mockOpenSession("session-1");
        WebSocketSession secondSession = mockOpenSession("session-2");

        imService.registerSession("1", UserSession.builder().webSocketSession(firstSession).build());
        clearInvocations(routeRegistry, presenceTopic, presenceTransitionDeduplicator, firstSession);

        when(presenceTransitionDeduplicator.tryTransition("1", UserStatus.ONLINE)).thenReturn(false);
        when(routeRegistry.isUserGloballyOnline("1")).thenReturn(true, false, false, true, true);

        boolean removed = imService.unregisterSession("1", "session-1", CloseStatus.NORMAL);
        assertTrue(removed);

        Thread.sleep(40L);
        imService.registerSession("1", UserSession.builder().webSocketSession(secondSession).build());
        Thread.sleep(180L);

        verify(presenceTransitionDeduplicator, never()).tryTransition("1", UserStatus.OFFLINE);
        verify(presenceTransitionDeduplicator, times(1)).tryTransition("1", UserStatus.ONLINE);
        verify(presenceTopic, never()).publish(any());
        assertEquals(1.0, meterRegistry.counter("route_registry_state_transitions", "transition", "online").count());
        assertEquals(0.0, meterRegistry.counter("route_registry_state_transitions", "transition", "offline").count());
    }

    @Test
    void withUserLock_shouldSerializeSameUserId() throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch firstEntered = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        CountDownLatch secondEntered = new CountDownLatch(1);
        AtomicInteger activeCriticalSections = new AtomicInteger();
        AtomicInteger maxConcurrentCriticalSections = new AtomicInteger();

        try {
            Future<?> first = executor.submit(() -> invokeWithUserLock("same-user", () -> {
                enterCriticalSection(activeCriticalSections, maxConcurrentCriticalSections);
                firstEntered.countDown();
                await(releaseFirst);
                activeCriticalSections.decrementAndGet();
                return null;
            }));
            assertTrue(firstEntered.await(2, TimeUnit.SECONDS));

            Future<?> second = executor.submit(() -> invokeWithUserLock("same-user", () -> {
                enterCriticalSection(activeCriticalSections, maxConcurrentCriticalSections);
                secondEntered.countDown();
                activeCriticalSections.decrementAndGet();
                return null;
            }));

            assertFalse(secondEntered.await(150, TimeUnit.MILLISECONDS));
            releaseFirst.countDown();
            first.get(2, TimeUnit.SECONDS);
            second.get(2, TimeUnit.SECONDS);
            assertEquals(1, maxConcurrentCriticalSections.get());
        } finally {
            releaseFirst.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void withUserLock_shouldAllowDifferentUserIdsToExecute() throws Exception {
        String firstUserId = "user-a";
        String secondUserId = findUserIdOnDifferentStripe(firstUserId);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch bothEntered = new CountDownLatch(2);
        CountDownLatch releaseBoth = new CountDownLatch(1);
        AtomicInteger activeCriticalSections = new AtomicInteger();
        AtomicInteger maxConcurrentCriticalSections = new AtomicInteger();

        try {
            Future<?> first = executor.submit(() -> invokeWithUserLock(firstUserId, () -> {
                enterCriticalSection(activeCriticalSections, maxConcurrentCriticalSections);
                bothEntered.countDown();
                await(releaseBoth);
                activeCriticalSections.decrementAndGet();
                return null;
            }));
            Future<?> second = executor.submit(() -> invokeWithUserLock(secondUserId, () -> {
                enterCriticalSection(activeCriticalSections, maxConcurrentCriticalSections);
                bothEntered.countDown();
                await(releaseBoth);
                activeCriticalSections.decrementAndGet();
                return null;
            }));

            assertTrue(bothEntered.await(2, TimeUnit.SECONDS));
            assertEquals(2, maxConcurrentCriticalSections.get());
            releaseBoth.countDown();
            first.get(2, TimeUnit.SECONDS);
            second.get(2, TimeUnit.SECONDS);
        } finally {
            releaseBoth.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void withUserLock_shouldKeepLockCountBounded() {
        for (int i = 0; i < 5000; i++) {
            invokeWithUserLock("user-" + i, () -> null);
        }

        ReentrantLock[] locks = (ReentrantLock[]) ReflectionTestUtils.getField(imService, "userLocks");
        assertNotNull(locks);
        assertEquals(1024, locks.length);
    }

    private WebSocketSession mockOpenSession(String sessionId) throws Exception {
        WebSocketSession webSocketSession = org.mockito.Mockito.mock(WebSocketSession.class);
        when(webSocketSession.getId()).thenReturn(sessionId);
        when(webSocketSession.isOpen()).thenReturn(true);
        return webSocketSession;
    }

    @SuppressWarnings("unchecked")
    private <T> T invokeWithUserLock(String userId, Supplier<T> supplier) {
        return (T) ReflectionTestUtils.invokeMethod(imService, "withUserLock", userId, supplier);
    }

    private String findUserIdOnDifferentStripe(String firstUserId) {
        ReentrantLock firstLock = lockForUser(firstUserId);
        for (int i = 0; i < 10000; i++) {
            String candidate = "different-user-" + i;
            if (lockForUser(candidate) != firstLock) {
                return candidate;
            }
        }
        throw new AssertionError("Unable to find a userId mapped to a different lock stripe");
    }

    private ReentrantLock lockForUser(String userId) {
        return ReflectionTestUtils.invokeMethod(imService, "lockForUser", userId);
    }

    private void enterCriticalSection(AtomicInteger activeCriticalSections, AtomicInteger maxConcurrentCriticalSections) {
        int active = activeCriticalSections.incrementAndGet();
        maxConcurrentCriticalSections.accumulateAndGet(active, Math::max);
    }

    private void await(CountDownLatch latch) {
        try {
            if (!latch.await(2, TimeUnit.SECONDS)) {
                throw new AssertionError("Timed out waiting for latch");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AssertionError("Interrupted while waiting for latch", e);
        }
    }

    private void awaitCondition(BooleanSupplier condition, long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            try {
                Thread.sleep(20L);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new AssertionError("Interrupted while waiting for condition", e);
            }
        }
        assertTrue(condition.getAsBoolean(), "Condition was not met within timeout");
    }

    private void assertGaugeValue(String meterName, double expectedValue) {
        io.micrometer.core.instrument.Gauge gauge = meterRegistry.find(meterName).gauge();
        assertNotNull(gauge);
        double value = gauge.value();
        if (Double.isNaN(value)) {
            return;
        }
        assertEquals(expectedValue, value);
    }

    private double pushCount(String result, String type) {
        return meterRegistry.counter("im.websocket.push.total", "result", result, "type", type).count();
    }

    private ListAppender<ILoggingEvent> attachListAppender() {
        Logger logger = (Logger) LoggerFactory.getLogger(ImServiceImpl.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        return appender;
    }

    private void detachListAppender(ListAppender<ILoggingEvent> appender) {
        Logger logger = (Logger) LoggerFactory.getLogger(ImServiceImpl.class);
        logger.detachAppender(appender);
    }

    private String joinedMessages(ListAppender<ILoggingEvent> appender) {
        StringBuilder builder = new StringBuilder();
        for (ILoggingEvent event : appender.list) {
            builder.append(event.getFormattedMessage()).append('\n');
        }
        return builder.toString();
    }
}
