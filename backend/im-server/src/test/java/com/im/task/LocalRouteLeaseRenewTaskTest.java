package com.im.task;

import com.im.config.ImNodeIdentity;
import com.im.service.IImService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RMapCache;
import org.redisson.api.RedissonClient;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Set;
import java.util.concurrent.TimeUnit;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LocalRouteLeaseRenewTaskTest {

    @Mock
    private IImService imService;

    @Mock
    private RedissonClient redissonClient;

    @Mock
    private ImNodeIdentity nodeIdentity;

    @Mock
    private RMapCache<String, String> routeMap;

    private LocalRouteLeaseRenewTask task;

    @BeforeEach
    void setUp() {
        task = new LocalRouteLeaseRenewTask(imService, redissonClient, nodeIdentity);
        ReflectionTestUtils.setField(task, "routeUsersKey", "im:route:users");
        ReflectionTestUtils.setField(task, "routeLeaseTtlMs", 120000L);
        lenient().when(nodeIdentity.getInstanceId()).thenReturn("im-node-1");
    }

    @Test
    void renewLeases_shouldRefreshRouteEntryTtl() {
        when(imService.getLocallyOnlineUserIds()).thenReturn(Set.of("1", "2"));
        when(redissonClient.<String, String>getMapCache("im:route:users")).thenReturn(routeMap);

        task.renewLeases();

        verify(routeMap).fastPut("1", "im-node-1", 120000L, TimeUnit.MILLISECONDS);
        verify(routeMap).fastPut("2", "im-node-1", 120000L, TimeUnit.MILLISECONDS);
    }

    @Test
    void renewLeases_shouldSkipWhenNoLocalUsers() {
        when(imService.getLocallyOnlineUserIds()).thenReturn(Set.of());

        task.renewLeases();

        verify(redissonClient, never()).getMapCache("im:route:users");
    }
}
