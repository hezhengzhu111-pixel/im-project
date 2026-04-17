package com.im.service.presence;

import com.im.enums.UserStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RLock;
import org.redisson.api.RMapCache;
import org.redisson.api.RedissonClient;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
class PresenceTransitionDeduplicatorTest {

    @Mock
    private RedissonClient redissonClient;

    @Mock
    private RMapCache<String, String> presenceStateMap;

    @Mock
    private RLock stateLock;

    private final Map<String, String> states = new ConcurrentHashMap<>();
    private final ReentrantLock localLock = new ReentrantLock();

    private PresenceTransitionDeduplicator deduplicator;

    @BeforeEach
    void setUp() {
        deduplicator = new PresenceTransitionDeduplicator(redissonClient);
        ReflectionTestUtils.setField(deduplicator, "presenceStateKey", "im:presence:state");
        ReflectionTestUtils.setField(deduplicator, "presenceStateTtlMs", 600000L);

        lenient().when(redissonClient.<String, String>getMapCache("im:presence:state")).thenReturn(presenceStateMap);
        lenient().when(redissonClient.getLock(anyString())).thenReturn(stateLock);
        lenient().when(presenceStateMap.get(anyString())).thenAnswer(invocation -> states.get(invocation.getArgument(0)));
        lenient().doAnswer(invocation -> {
            states.put(invocation.getArgument(0), invocation.getArgument(1));
            return true;
        }).when(presenceStateMap).fastPut(anyString(), anyString(), anyLong(), eq(TimeUnit.MILLISECONDS));
        lenient().doAnswer(invocation -> {
            localLock.lock();
            return null;
        }).when(stateLock).lock();
        lenient().doAnswer(invocation -> {
            localLock.unlock();
            return null;
        }).when(stateLock).unlock();

        deduplicator.init();
    }

    @Test
    void tryTransition_shouldOnlyReturnTrueWhenStatusChanges() {
        assertTrue(deduplicator.tryTransition("1", UserStatus.ONLINE));
        assertFalse(deduplicator.tryTransition("1", UserStatus.ONLINE));
        assertTrue(deduplicator.tryTransition("1", UserStatus.OFFLINE));
    }

    @Test
    void tryTransition_shouldIgnoreBlankUserId() {
        assertFalse(deduplicator.tryTransition(" ", UserStatus.ONLINE));
    }
}
