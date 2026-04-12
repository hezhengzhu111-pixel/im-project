package com.im.task;

import com.im.config.ImNodeIdentity;
import com.im.service.MessageRetryQueue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RBlockingQueue;
import org.redisson.api.RDelayedQueue;
import org.redisson.api.RKeys;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RetryQueueJanitorTest {

    @Mock
    private RedissonClient redissonClient;

    @Mock
    private ImNodeIdentity nodeIdentity;

    @Mock
    private ObjectProvider<DiscoveryClient> discoveryClientProvider;

    @Mock
    private DiscoveryClient discoveryClient;

    @Mock
    private RKeys keys;

    @Mock
    private RBlockingQueue<MessageRetryQueue.RetryItem> blockingQueue;

    @Mock
    private RDelayedQueue<MessageRetryQueue.RetryItem> delayedQueue;

    private RetryQueueJanitor janitor;

    @BeforeEach
    void setUp() {
        janitor = new RetryQueueJanitor(redissonClient, nodeIdentity, discoveryClientProvider);
        ReflectionTestUtils.setField(janitor, "applicationName", "im-server");
        lenient().when(nodeIdentity.getInstanceId()).thenReturn("im-node-1");
    }

    @Test
    void cleanupOrphanQueues_shouldDeleteQueuesForDeadInstances() {
        ServiceInstance liveInstance = org.mockito.Mockito.mock(ServiceInstance.class);
        when(liveInstance.getInstanceId()).thenReturn("im-node-2");
        when(discoveryClientProvider.getIfAvailable()).thenReturn(discoveryClient);
        when(discoveryClient.getInstances("im-server")).thenReturn(List.of(liveInstance));
        when(redissonClient.getKeys()).thenReturn(keys);
        when(keys.getKeysByPattern("im:message:retry:queue:*")).thenReturn(List.of(
                "im:message:retry:queue:im-node-1",
                "im:message:retry:queue:im-node-2",
                "im:message:retry:queue:dead-node"));
        when(redissonClient.<MessageRetryQueue.RetryItem>getBlockingQueue("im:message:retry:queue:dead-node"))
                .thenReturn(blockingQueue);
        when(redissonClient.getDelayedQueue(blockingQueue)).thenReturn(delayedQueue);

        janitor.cleanupOrphanQueues();

        verify(delayedQueue).destroy();
        verify(blockingQueue).delete();
    }

    @Test
    void cleanupOrphanQueues_shouldSkipWhenDiscoveryUnavailable() {
        when(discoveryClientProvider.getIfAvailable()).thenReturn(null);

        janitor.cleanupOrphanQueues();

        verify(redissonClient, never()).getKeys();
    }
}
