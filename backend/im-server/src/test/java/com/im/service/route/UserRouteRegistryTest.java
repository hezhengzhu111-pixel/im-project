package com.im.service.route;

import com.alibaba.fastjson2.JSON;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RLock;
import org.redisson.api.RMapCache;
import org.redisson.api.RedissonClient;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserRouteRegistryTest {

    @Mock
    private RedissonClient redissonClient;

    @Mock
    private RMapCache<String, String> routeMap;

    @Mock
    private RLock routeLock;

    private final Map<String, String> storedSnapshots = new ConcurrentHashMap<>();
    private final ReentrantLock localLock = new ReentrantLock();

    private UserRouteRegistry routeRegistry;

    @BeforeEach
    void setUp() {
        routeRegistry = new UserRouteRegistry(redissonClient);
        ReflectionTestUtils.setField(routeRegistry, "routeUsersKey", "im:route:users");
        ReflectionTestUtils.setField(routeRegistry, "routeLeaseTtlMs", 120000L);

        when(redissonClient.<String, String>getMapCache("im:route:users")).thenReturn(routeMap);
        when(redissonClient.getLock(anyString())).thenReturn(routeLock);
        when(routeMap.get(anyString())).thenAnswer(invocation -> storedSnapshots.get(invocation.getArgument(0)));
        doAnswer(invocation -> {
            storedSnapshots.put(invocation.getArgument(0), invocation.getArgument(1));
            return true;
        }).when(routeMap).fastPut(anyString(), anyString(), anyLong(), eq(TimeUnit.MILLISECONDS));
        lenient().doAnswer(invocation -> {
            storedSnapshots.remove(invocation.getArgument(0));
            return 1L;
        }).when(routeMap).fastRemove(anyString());
        doAnswer(invocation -> {
            localLock.lock();
            return null;
        }).when(routeLock).lock();
        doAnswer(invocation -> {
            localLock.unlock();
            return null;
        }).when(routeLock).unlock();

        routeRegistry.init();
    }

    @Test
    void routeRegistry_shouldKeepUserOnlineUntilAllInstancesRemoved() {
        routeRegistry.upsertLocalRoute("1", "im-node-1", 1);
        routeRegistry.upsertLocalRoute("1", "im-node-2", 2);

        assertTrue(routeRegistry.isUserGloballyOnline("1"));
        assertEquals(Map.of("im-node-1", 1, "im-node-2", 2), routeRegistry.getInstanceSessionCounts("1"));

        routeRegistry.removeLocalRoute("1", "im-node-1");

        assertTrue(routeRegistry.isUserGloballyOnline("1"));
        assertEquals(Map.of("im-node-2", 2), routeRegistry.getInstanceSessionCounts("1"));

        routeRegistry.removeLocalRoute("1", "im-node-2");

        assertFalse(routeRegistry.isUserGloballyOnline("1"));
        assertEquals(Map.of(), routeRegistry.getInstanceSessionCounts("1"));
    }

    @Test
    void renewLocalRoute_shouldPruneExpiredInstanceWithoutDeletingActiveInstance() {
        long nowMs = System.currentTimeMillis();
        LinkedHashMap<String, UserRouteRegistry.RouteLease> snapshot = new LinkedHashMap<>();
        snapshot.put("im-node-1", new UserRouteRegistry.RouteLease(1, nowMs - 1));
        snapshot.put("im-node-2", new UserRouteRegistry.RouteLease(1, nowMs + 120000L));
        storedSnapshots.put("1", JSON.toJSONString(snapshot));

        routeRegistry.renewLocalRoute("1", "im-node-2", 1);

        assertEquals(Map.of("im-node-2", 1), routeRegistry.getInstanceSessionCounts("1"));
        assertEquals(1, routeRegistry.getGlobalSessionCount("1"));
    }
}
