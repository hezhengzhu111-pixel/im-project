package com.im.service.impl;

import com.im.config.ImNodeIdentity;
import com.im.dto.MessageDTO;
import com.im.entity.UserSession;
import com.im.enums.MessageType;
import com.im.enums.UserStatus;
import com.im.metrics.ImServerMetrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RBucket;
import org.redisson.api.RSetMultimap;
import org.redisson.api.RedissonClient;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ImServiceImplTest {

    @Mock
    private RedissonClient redissonClient;

    @Mock
    private ImNodeIdentity nodeIdentity;

    @Mock
    private RSetMultimap<String, String> routeMultimap;

    @Mock
    private RBucket<String> localLeaseBucket;

    @Mock
    private RBucket<String> staleLeaseBucket;

    private ImServiceImpl imService;
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        imService = new ImServiceImpl(redissonClient, nodeIdentity);
        meterRegistry = new SimpleMeterRegistry();
        ReflectionTestUtils.setField(imService, "metrics", new ImServerMetrics(meterRegistry));
        ReflectionTestUtils.setField(imService, "routeUsersKey", "im:route:users");
        ReflectionTestUtils.setField(imService, "routeLeaseKeyPrefix", "im:route:lease:");
        ReflectionTestUtils.setField(imService, "routeLeaseTtlMs", 120000L);
        ReflectionTestUtils.setField(imService, "heartbeatTimeoutMs", 90000L);

        lenient().when(nodeIdentity.getInstanceId()).thenReturn("im-node-1");
        lenient().when(redissonClient.<String, String>getSetMultimap("im:route:users")).thenReturn(routeMultimap);
        lenient().when(redissonClient.<String>getBucket("im:route:lease:1:im-node-1")).thenReturn(localLeaseBucket);
        lenient().when(redissonClient.<String>getBucket("im:route:lease:1:stale-node")).thenReturn(staleLeaseBucket);
        lenient().when(localLeaseBucket.isExists()).thenReturn(true);
        lenient().when(staleLeaseBucket.isExists()).thenReturn(false);

        imService.init();
    }

    @Test
    void registerSession_shouldCreateLeaseAndRouteOnFirstLocalConnection() throws Exception {
        WebSocketSession webSocketSession = mockOpenSession("session-1");
        UserSession userSession = UserSession.builder().webSocketSession(webSocketSession).build();

        imService.registerSession("1", userSession);

        verify(localLeaseBucket).set("1", 120000L, TimeUnit.MILLISECONDS);
        verify(routeMultimap).put("1", "im-node-1");
        assertTrue(imService.isSessionActive("1", "session-1"));
        assertNotNull(userSession.getLastHeartbeat());
        assertTrue(imService.getLocallyOnlineUserIds().contains("1"));
        assertEquals(1.0, meterRegistry.get("im.websocket.connections.current").gauge().value());
        assertEquals(1.0, meterRegistry.get("im.websocket.users.local").gauge().value());
    }

    @Test
    void unregisterSession_shouldRemoveLeaseAndRouteWhenLastLocalSessionCloses() throws Exception {
        WebSocketSession webSocketSession = mockOpenSession("session-1");
        UserSession userSession = UserSession.builder().webSocketSession(webSocketSession).build();
        imService.registerSession("1", userSession);
        clearInvocations(routeMultimap, localLeaseBucket, webSocketSession);

        boolean removed = imService.unregisterSession("1", "session-1", CloseStatus.NORMAL);

        assertTrue(removed);
        verify(routeMultimap).remove("1", "im-node-1");
        verify(localLeaseBucket).delete();
        verify(webSocketSession).close(CloseStatus.NORMAL);
        assertFalse(imService.isSessionActive("1", "session-1"));
        assertEquals(0.0, meterRegistry.get("im.websocket.connections.current").gauge().value());
        assertEquals(0.0, meterRegistry.get("im.websocket.users.local").gauge().value());
    }

    @Test
    void touchUserHeartbeat_shouldOnlyRefreshLocalState() throws Exception {
        WebSocketSession webSocketSession = mockOpenSession("session-1");
        UserSession userSession = UserSession.builder().webSocketSession(webSocketSession).build();
        imService.registerSession("1", userSession);
        clearInvocations(routeMultimap, localLeaseBucket);

        boolean touched = imService.touchUserHeartbeat("1");

        assertTrue(touched);
        verify(routeMultimap, never()).put(anyString(), anyString());
        verify(routeMultimap, never()).remove(anyString(), anyString());
        verify(localLeaseBucket, never()).set(anyString(), anyLong(), any(TimeUnit.class));
    }

    @Test
    void pushMessageToSession_shouldUnregisterOnlyFailedSessionWhenSendFails() throws Exception {
        WebSocketSession failingSession = mockOpenSession("session-1");
        WebSocketSession healthySession = mockOpenSession("session-2");
        imService.registerSession("1", UserSession.builder().webSocketSession(failingSession).build());
        imService.registerSession("1", UserSession.builder().webSocketSession(healthySession).build());
        clearInvocations(routeMultimap, localLeaseBucket, failingSession, healthySession);
        doThrow(new IllegalStateException("send busy")).when(failingSession).sendMessage(any());
        MessageDTO message = MessageDTO.builder()
                .senderId(2L)
                .receiverId(1L)
                .messageType(MessageType.TEXT)
                .content("hello")
                .build();

        boolean success = imService.pushMessageToSession(message, "session-1");

        assertFalse(success);
        verify(failingSession).close(argThat(status -> status.getCode() == CloseStatus.SESSION_NOT_RELIABLE.getCode()
                && "send failed".equals(status.getReason())));
        verify(healthySession, never()).close(any(CloseStatus.class));
        verify(healthySession, never()).close();
        verify(routeMultimap, never()).remove(anyString(), anyString());
        verify(localLeaseBucket, never()).delete();
        assertFalse(imService.isSessionActive("1", "session-1"));
        assertTrue(imService.isSessionActive("1", "session-2"));
        assertEquals(1.0, pushCount("failure", "MESSAGE"));
        assertEquals(1L, meterRegistry.get("im.websocket.push.duration")
                .tag("result", "failure")
                .tag("type", "MESSAGE")
                .timer()
                .count());
    }

    @Test
    void checkUsersOnlineStatus_shouldFilterStaleRoutesByLease() {
        when(routeMultimap.getAll("1")).thenReturn(new LinkedHashSet<>(Set.of("im-node-1", "stale-node")));

        Map<String, Boolean> result = imService.checkUsersOnlineStatus(List.of("1"));

        assertTrue(result.get("1"));
        verify(routeMultimap).remove("1", "stale-node");
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

    private double pushCount(String result, String type) {
        return meterRegistry.counter("im.websocket.push.total", "result", result, "type", type).count();
    }
}
