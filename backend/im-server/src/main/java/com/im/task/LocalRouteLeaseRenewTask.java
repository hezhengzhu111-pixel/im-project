package com.im.task;

import com.im.config.ImNodeIdentity;
import com.im.service.IImService;
import lombok.extern.slf4j.Slf4j;
import lombok.RequiredArgsConstructor;
import org.redisson.api.RMapCache;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@RequiredArgsConstructor
public class LocalRouteLeaseRenewTask {

    private final IImService imService;
    private final RedissonClient redissonClient;
    private final ImNodeIdentity nodeIdentity;

    @Value("${im.route.users-key:im:route:users}")
    private String routeUsersKey;

    @Value("${im.route.lease-ttl-ms:120000}")
    private long routeLeaseTtlMs;

    @Scheduled(fixedDelayString = "${im.route.lease-renew-interval-ms:30000}")
    public void renewLeases() {
        Set<String> userIds = imService.getLocallyOnlineUserIds();
        if (userIds.isEmpty()) {
            return;
        }

        String instanceId = nodeIdentity.getInstanceId();
        long ttlMs = Math.max(1000L, routeLeaseTtlMs);
        RMapCache<String, String> routeMap = redissonClient.getMapCache(routeUsersKey);

        for (String userId : userIds) {
            routeMap.fastPut(userId, instanceId, ttlMs, TimeUnit.MILLISECONDS);
        }
        log.debug("Renewed local route leases. instanceId={}, users={}", instanceId, userIds.size());
    }
}
