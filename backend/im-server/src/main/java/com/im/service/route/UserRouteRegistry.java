package com.im.service.route;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.TypeReference;
import jakarta.annotation.PostConstruct;
import lombok.AllArgsConstructor;
import lombok.Data;
import org.apache.commons.lang3.StringUtils;
import org.redisson.api.RLock;
import org.redisson.api.RMapCache;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

@Component
public class UserRouteRegistry {

    private static final TypeReference<LinkedHashMap<String, RouteLease>> ROUTE_SNAPSHOT_TYPE =
            new TypeReference<>() {
            };

    private final RedissonClient redissonClient;

    @Value("${im.route.users-key:im:route:users}")
    private String routeUsersKey;

    @Value("${im.route.lease-ttl-ms:120000}")
    private long routeLeaseTtlMs;

    private RMapCache<String, String> routeMap;

    public UserRouteRegistry(RedissonClient redissonClient) {
        this.redissonClient = redissonClient;
    }

    @PostConstruct
    public void init() {
        routeMap = redissonClient.getMapCache(routeUsersKey);
    }

    public void upsertLocalRoute(String userId, String instanceId, int sessionCount) {
        if (!hasKey(userId, instanceId)) {
            return;
        }
        withRouteLock(userId, () -> {
            long nowMs = System.currentTimeMillis();
            LinkedHashMap<String, RouteLease> snapshot = loadSnapshot(userId, nowMs);
            if (sessionCount <= 0) {
                snapshot.remove(instanceId);
            } else {
                snapshot.put(instanceId, new RouteLease(sessionCount, nowMs + safeTtlMs()));
            }
            persistSnapshot(userId, snapshot, nowMs);
            return null;
        });
    }

    public void renewLocalRoute(String userId, String instanceId, int sessionCount) {
        upsertLocalRoute(userId, instanceId, sessionCount);
    }

    public void removeLocalRoute(String userId, String instanceId) {
        upsertLocalRoute(userId, instanceId, 0);
    }

    public boolean isUserGloballyOnline(String userId) {
        return getGlobalSessionCount(userId) > 0;
    }

    public int getGlobalSessionCount(String userId) {
        Map<String, Integer> counts = getInstanceSessionCounts(userId);
        int total = 0;
        for (Integer count : counts.values()) {
            if (count != null && count > 0) {
                total += count;
            }
        }
        return total;
    }

    public Map<String, Integer> getInstanceSessionCounts(String userId) {
        if (StringUtils.isBlank(userId)) {
            return Map.of();
        }
        return withRouteLock(userId, () -> {
            long nowMs = System.currentTimeMillis();
            LinkedHashMap<String, RouteLease> snapshot = loadSnapshot(userId, nowMs);
            persistSnapshot(userId, snapshot, nowMs);
            if (snapshot.isEmpty()) {
                return Map.of();
            }
            LinkedHashMap<String, Integer> counts = new LinkedHashMap<>();
            for (Map.Entry<String, RouteLease> entry : snapshot.entrySet()) {
                RouteLease lease = entry.getValue();
                if (lease != null && lease.getSessionCount() > 0) {
                    counts.put(entry.getKey(), lease.getSessionCount());
                }
            }
            return Map.copyOf(counts);
        });
    }

    private boolean hasKey(String userId, String instanceId) {
        return StringUtils.isNotBlank(userId) && StringUtils.isNotBlank(instanceId);
    }

    private LinkedHashMap<String, RouteLease> loadSnapshot(String userId, long nowMs) {
        if (routeMap == null || StringUtils.isBlank(userId)) {
            return new LinkedHashMap<>();
        }
        String payload = routeMap.get(userId);
        if (StringUtils.isBlank(payload)) {
            return new LinkedHashMap<>();
        }
        try {
            LinkedHashMap<String, RouteLease> snapshot = JSON.parseObject(payload, ROUTE_SNAPSHOT_TYPE);
            if (snapshot == null) {
                return new LinkedHashMap<>();
            }
            pruneExpired(snapshot, nowMs);
            return snapshot;
        } catch (Exception ignored) {
            routeMap.fastRemove(userId);
            return new LinkedHashMap<>();
        }
    }

    private void pruneExpired(LinkedHashMap<String, RouteLease> snapshot, long nowMs) {
        snapshot.entrySet().removeIf(entry -> {
            String instanceId = entry.getKey();
            RouteLease lease = entry.getValue();
            return StringUtils.isBlank(instanceId)
                    || lease == null
                    || lease.getSessionCount() <= 0
                    || lease.getExpiresAtEpochMs() <= nowMs;
        });
    }

    private void persistSnapshot(String userId, LinkedHashMap<String, RouteLease> snapshot, long nowMs) {
        if (routeMap == null || StringUtils.isBlank(userId)) {
            return;
        }
        if (snapshot == null || snapshot.isEmpty()) {
            routeMap.fastRemove(userId);
            return;
        }
        long ttlMs = computeSnapshotTtlMs(snapshot, nowMs);
        if (ttlMs <= 0) {
            routeMap.fastRemove(userId);
            return;
        }
        routeMap.fastPut(userId, JSON.toJSONString(snapshot), ttlMs, TimeUnit.MILLISECONDS);
    }

    private long computeSnapshotTtlMs(LinkedHashMap<String, RouteLease> snapshot, long nowMs) {
        long maxExpiresAt = 0L;
        for (RouteLease lease : snapshot.values()) {
            if (lease != null) {
                maxExpiresAt = Math.max(maxExpiresAt, lease.getExpiresAtEpochMs());
            }
        }
        return Math.max(0L, maxExpiresAt - nowMs);
    }

    private long safeTtlMs() {
        return Math.max(1000L, routeLeaseTtlMs);
    }

    private <T> T withRouteLock(String userId, Supplier<T> supplier) {
        RLock lock = redissonClient.getLock(routeUsersKey + ":lock:" + userId);
        lock.lock();
        try {
            return supplier.get();
        } finally {
            lock.unlock();
        }
    }

    @Data
    @AllArgsConstructor
    public static class RouteLease {
        private int sessionCount;
        private long expiresAtEpochMs;
    }
}
