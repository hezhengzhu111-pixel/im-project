package com.im.service.impl;

import com.im.config.ImNodeIdentity;
import com.im.entity.UserSession;
import com.im.enums.UserStatus;
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
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doNothing;
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

    @BeforeEach
    void setUp() {
        imService = new ImServiceImpl(redissonClient, nodeIdentity);
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
    void checkUsersOnlineStatus_shouldFilterStaleRoutesByLease() {
        when(routeMultimap.getAll("1")).thenReturn(new LinkedHashSet<>(Set.of("im-node-1", "stale-node")));

        Map<String, Boolean> result = imService.checkUsersOnlineStatus(List.of("1"));

        assertTrue(result.get("1"));
        verify(routeMultimap).remove("1", "stale-node");
    }

    private WebSocketSession mockOpenSession(String sessionId) throws Exception {
        WebSocketSession webSocketSession = org.mockito.Mockito.mock(WebSocketSession.class);
        when(webSocketSession.getId()).thenReturn(sessionId);
        when(webSocketSession.isOpen()).thenReturn(true);
        doNothing().when(webSocketSession).sendMessage(any());
        return webSocketSession;
    }
}
