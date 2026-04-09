package com.im.task;

import com.im.config.ImNodeIdentity;
import com.im.service.MessageRetryQueue;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.redisson.api.RBlockingQueue;
import org.redisson.api.RDelayedQueue;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class RetryQueueJanitor {

    private final RedissonClient redissonClient;
    private final ImNodeIdentity nodeIdentity;
    private final ObjectProvider<DiscoveryClient> discoveryClientProvider;

    @Value("${spring.application.name:im-server}")
    private String applicationName;

    @Scheduled(initialDelayString = "${im.retry.janitor-initial-delay-ms:15000}",
            fixedDelayString = "${im.retry.janitor-interval-ms:300000}")
    public void cleanupOrphanQueues() {
        DiscoveryClient discoveryClient = discoveryClientProvider.getIfAvailable();
        if (discoveryClient == null) {
            log.debug("Skip retry queue janitor because DiscoveryClient is unavailable.");
            return;
        }

        Set<String> activeInstanceIds = resolveActiveInstanceIds(discoveryClient);
        if (activeInstanceIds.isEmpty()) {
            log.debug("Skip retry queue janitor because no active instances were discovered.");
            return;
        }

        for (String queueName : redissonClient.getKeys().getKeysByPattern(MessageRetryQueue.QUEUE_NAME_PREFIX + "*")) {
            String instanceId = extractInstanceId(queueName);
            if (StringUtils.isBlank(instanceId) || activeInstanceIds.contains(instanceId)) {
                continue;
            }
            cleanupQueue(queueName, instanceId);
        }
    }

    private Set<String> resolveActiveInstanceIds(DiscoveryClient discoveryClient) {
        Set<String> instanceIds = new LinkedHashSet<>();
        instanceIds.add(nodeIdentity.getInstanceId());
        try {
            for (ServiceInstance instance : discoveryClient.getInstances(applicationName)) {
                if (instance == null) {
                    continue;
                }
                String instanceId = instance.getInstanceId();
                if (StringUtils.isBlank(instanceId)) {
                    instanceId = instance.getHost() + ":" + instance.getPort();
                }
                if (StringUtils.isNotBlank(instanceId)) {
                    instanceIds.add(instanceId.trim());
                }
            }
        } catch (Exception e) {
            log.warn("Resolve active IM server instances failed for retry queue janitor.", e);
            return Set.of();
        }
        return instanceIds;
    }

    private void cleanupQueue(String queueName, String instanceId) {
        try {
            RBlockingQueue<MessageRetryQueue.RetryItem> blockingQueue = redissonClient.getBlockingQueue(queueName);
            RDelayedQueue<MessageRetryQueue.RetryItem> delayedQueue = redissonClient.getDelayedQueue(blockingQueue);
            delayedQueue.destroy();
            blockingQueue.delete();
            log.info("Cleaned orphan retry queue. queueName={}, instanceId={}", queueName, instanceId);
        } catch (Exception e) {
            log.warn("Cleanup orphan retry queue failed. queueName={}, instanceId={}", queueName, instanceId, e);
        }
    }

    private String extractInstanceId(String queueName) {
        if (StringUtils.isBlank(queueName) || !queueName.startsWith(MessageRetryQueue.QUEUE_NAME_PREFIX)) {
            return null;
        }
        return queueName.substring(MessageRetryQueue.QUEUE_NAME_PREFIX.length());
    }
}
