package com.im.task;

import com.im.config.ImNodeIdentity;
import com.im.service.IImService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RBatch;
import org.redisson.api.RBucketAsync;
import org.redisson.api.RSetMultimap;
import org.redisson.api.RedissonClient;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import static org.mockito.ArgumentMatchers.eq;
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
    private RBatch batch;

    @Mock
    private RSetMultimap<String, String> multimapAsync;

    private LocalRouteLeaseRenewTask task;

    @BeforeEach
    void setUp() {
        task = new LocalRouteLeaseRenewTask(imService, redissonClient, nodeIdentity);
        ReflectionTestUtils.setField(task, "routeUsersKey", "im:route:users");
        ReflectionTestUtils.setField(task, "routeLeaseKeyPrefix", "im:route:lease:");
        ReflectionTestUtils.setField(task, "routeLeaseTtlMs", 120000L);
        lenient().when(nodeIdentity.getInstanceId()).thenReturn("im-node-1");
    }

    @Test
    void renewLeases_shouldBatchLeaseRefreshAndRouteRepair() {
        Map<String, RBucketAsync<String>> buckets = new HashMap<>();
        when(imService.getLocallyOnlineUserIds()).thenReturn(Set.of("1", "2"));
        when(redissonClient.createBatch()).thenReturn(batch);
        when(batch.<String, String>getSetMultimap("im:route:users")).thenReturn(multimapAsync);
        when(batch.getBucket(org.mockito.ArgumentMatchers.anyString())).thenAnswer(invocation -> {
            String key = invocation.getArgument(0);
            RBucketAsync<String> bucket = org.mockito.Mockito.mock(RBucketAsync.class);
            buckets.put(key, bucket);
            return bucket;
        });

        task.renewLeases();

        verify(multimapAsync).putAsync("1", "im-node-1");
        verify(multimapAsync).putAsync("2", "im-node-1");
        verify(buckets.get("im:route:lease:1:im-node-1")).setAsync("1", 120000L, TimeUnit.MILLISECONDS);
        verify(buckets.get("im:route:lease:2:im-node-1")).setAsync("1", 120000L, TimeUnit.MILLISECONDS);
        verify(batch).execute();
    }

    @Test
    void renewLeases_shouldSkipWhenNoLocalUsers() {
        when(imService.getLocallyOnlineUserIds()).thenReturn(Set.of());

        task.renewLeases();

        verify(redissonClient, never()).createBatch();
    }
}
