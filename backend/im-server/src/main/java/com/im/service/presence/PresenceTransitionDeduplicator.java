package com.im.service.presence;

import com.im.enums.UserStatus;
import jakarta.annotation.PostConstruct;
import org.apache.commons.lang3.StringUtils;
import org.redisson.api.RLock;
import org.redisson.api.RMapCache;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Component
public class PresenceTransitionDeduplicator {

    private final RedissonClient redissonClient;

    @Value("${im.ws.presence-state-key:im:presence:state}")
    private String presenceStateKey;

    @Value("${im.ws.presence-state-ttl-ms:604800000}")
    private long presenceStateTtlMs;

    private RMapCache<String, String> presenceStateMap;

    public PresenceTransitionDeduplicator(RedissonClient redissonClient) {
        this.redissonClient = redissonClient;
    }

    @PostConstruct
    public void init() {
        presenceStateMap = redissonClient.getMapCache(presenceStateKey);
    }

    public boolean tryTransition(String userId, UserStatus status) {
        if (StringUtils.isBlank(userId) || status == null || presenceStateMap == null) {
            return false;
        }
        String normalizedUserId = userId.trim();
        RLock lock = redissonClient.getLock(presenceStateKey + ":lock:" + normalizedUserId);
        lock.lock();
        try {
            String nextStatus = status.name();
            String currentStatus = presenceStateMap.get(normalizedUserId);
            if (nextStatus.equalsIgnoreCase(StringUtils.defaultString(currentStatus))) {
                return false;
            }
            presenceStateMap.fastPut(normalizedUserId, nextStatus, safeTtlMs(), TimeUnit.MILLISECONDS);
            return true;
        } finally {
            lock.unlock();
        }
    }

    private long safeTtlMs() {
        return Math.max(60000L, presenceStateTtlMs);
    }
}
