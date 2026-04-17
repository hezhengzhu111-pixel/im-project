package com.im.service.support;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.im.dto.UserDTO;
import com.im.feign.GroupServiceFeignClient;
import com.im.feign.UserServiceFeignClient;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

@Slf4j
@Component
@RequiredArgsConstructor
public class UserProfileCache {

    private static final String CACHE_USER_PROFILE = "user_profile";
    private static final String CACHE_FRIEND = "friend";
    private static final String CACHE_GROUP_MEMBER = "group_member";
    private static final String CACHE_GROUP_MEMBER_IDS = "group_member_ids";
    private static final String SCOPE_FRIEND_RELATION = "FRIEND_RELATION";
    private static final String SCOPE_GROUP_MEMBERSHIP = "GROUP_MEMBERSHIP";

    private static final long DEFAULT_USER_L1_TTL_SECONDS = 60;
    private static final long DEFAULT_USER_L1_MAX_SIZE = 10_000;
    private static final long DEFAULT_FRIEND_L1_TTL_SECONDS = 30;
    private static final long DEFAULT_FRIEND_L2_TTL_SECONDS = 60;
    private static final long DEFAULT_FRIEND_L1_MAX_SIZE = 20_000;
    private static final long DEFAULT_GROUP_MEMBER_L1_TTL_SECONDS = 30;
    private static final long DEFAULT_GROUP_MEMBER_L2_TTL_SECONDS = 60;
    private static final long DEFAULT_GROUP_MEMBER_L1_MAX_SIZE = 30_000;
    private static final long DEFAULT_GROUP_MEMBER_IDS_L1_TTL_SECONDS = 15;
    private static final long DEFAULT_GROUP_MEMBER_IDS_L2_TTL_SECONDS = 30;
    private static final long DEFAULT_GROUP_MEMBER_IDS_L1_MAX_SIZE = 5_000;

    private final RedisTemplate<String, Object> redisTemplate;
    private final UserServiceFeignClient userServiceFeignClient;
    private final GroupServiceFeignClient groupServiceFeignClient;

    @Value("${im.message.user-cache.key-prefix:user:brief:}")
    private String userCacheKeyPrefix;

    @Value("${im.message.user-cache.ttl-minutes:10}")
    private long userCacheTtlMinutes;

    @Value("${im.message.user-cache.l1-ttl-seconds:60}")
    private long userCacheL1TtlSeconds;

    @Value("${im.message.user-cache.l1-max-size:10000}")
    private long userCacheL1MaxSize;

    @Value("${im.message.friend-cache.key-prefix:message:friend:}")
    private String friendCacheKeyPrefix;

    @Value("${im.message.friend-cache.l1-ttl-seconds:30}")
    private long friendCacheL1TtlSeconds;

    @Value("${im.message.friend-cache.l2-ttl-seconds:60}")
    private long friendCacheL2TtlSeconds;

    @Value("${im.message.friend-cache.l1-max-size:20000}")
    private long friendCacheL1MaxSize;

    @Value("${im.message.group-member-cache.key-prefix:message:group:member:}")
    private String groupMemberCacheKeyPrefix;

    @Value("${im.message.group-member-cache.l1-ttl-seconds:30}")
    private long groupMemberCacheL1TtlSeconds;

    @Value("${im.message.group-member-cache.l2-ttl-seconds:60}")
    private long groupMemberCacheL2TtlSeconds;

    @Value("${im.message.group-member-cache.l1-max-size:30000}")
    private long groupMemberCacheL1MaxSize;

    @Value("${im.message.group-member-ids-cache.key-prefix:message:group:members:}")
    private String groupMemberIdsCacheKeyPrefix;

    @Value("${im.message.group-member-ids-cache.l1-ttl-seconds:15}")
    private long groupMemberIdsCacheL1TtlSeconds;

    @Value("${im.message.group-member-ids-cache.l2-ttl-seconds:30}")
    private long groupMemberIdsCacheL2TtlSeconds;

    @Value("${im.message.group-member-ids-cache.l1-max-size:5000}")
    private long groupMemberIdsCacheL1MaxSize;

    private volatile Cache<Long, UserDTO> userL1Cache;
    private volatile Cache<String, Boolean> friendL1Cache;
    private volatile Cache<String, Boolean> groupMemberL1Cache;
    private volatile Cache<Long, List<Long>> groupMemberIdsL1Cache;

    @PostConstruct
    void initCaches() {
        this.userL1Cache = newCache(userCacheL1TtlSeconds, userCacheL1MaxSize,
                DEFAULT_USER_L1_TTL_SECONDS, DEFAULT_USER_L1_MAX_SIZE);
        this.friendL1Cache = newCache(friendCacheL1TtlSeconds, friendCacheL1MaxSize,
                DEFAULT_FRIEND_L1_TTL_SECONDS, DEFAULT_FRIEND_L1_MAX_SIZE);
        this.groupMemberL1Cache = newCache(groupMemberCacheL1TtlSeconds, groupMemberCacheL1MaxSize,
                DEFAULT_GROUP_MEMBER_L1_TTL_SECONDS, DEFAULT_GROUP_MEMBER_L1_MAX_SIZE);
        this.groupMemberIdsL1Cache = newCache(groupMemberIdsCacheL1TtlSeconds, groupMemberIdsCacheL1MaxSize,
                DEFAULT_GROUP_MEMBER_IDS_L1_TTL_SECONDS, DEFAULT_GROUP_MEMBER_IDS_L1_MAX_SIZE);
    }

    public UserDTO getUser(Long userId) {
        if (userId == null) {
            return null;
        }
        ensureCachesInitialized();
        UserDTO l1Value = userL1Cache.getIfPresent(userId);
        if (l1Value != null) {
            recordCacheEvent(CACHE_USER_PROFILE, "l1_hit");
            return l1Value;
        }

        String key = userCacheKeyPrefix + userId;
        Object redisValue = readRedis(CACHE_USER_PROFILE, key);
        if (redisValue instanceof UserDTO dto) {
            userL1Cache.put(userId, dto);
            recordCacheEvent(CACHE_USER_PROFILE, "l2_hit");
            return dto;
        }

        recordCacheEvent(CACHE_USER_PROFILE, "miss");
        UserDTO dto = userServiceFeignClient.getUser(userId);
        if (dto != null) {
            userL1Cache.put(userId, dto);
            writeRedis(CACHE_USER_PROFILE, key, dto, positive(userCacheTtlMinutes, 10), TimeUnit.MINUTES);
        }
        return dto;
    }

    public Boolean isFriend(Long userId, Long friendId) {
        if (userId == null || friendId == null) {
            return false;
        }
        ensureCachesInitialized();
        String cacheKey = userId + ":" + friendId;
        String redisKey = friendCacheKeyPrefix + cacheKey;
        return getBoolean(
                CACHE_FRIEND,
                friendL1Cache,
                cacheKey,
                redisKey,
                positive(friendCacheL2TtlSeconds, DEFAULT_FRIEND_L2_TTL_SECONDS),
                () -> userServiceFeignClient.isFriend(userId, friendId)
        );
    }

    public Boolean isGroupMember(Long groupId, Long userId) {
        if (groupId == null || userId == null) {
            return false;
        }
        ensureCachesInitialized();
        String cacheKey = groupId + ":" + userId;
        String redisKey = groupMemberCacheKeyPrefix + cacheKey;
        return getBoolean(
                CACHE_GROUP_MEMBER,
                groupMemberL1Cache,
                cacheKey,
                redisKey,
                positive(groupMemberCacheL2TtlSeconds, DEFAULT_GROUP_MEMBER_L2_TTL_SECONDS),
                () -> groupServiceFeignClient.isMember(groupId, userId)
        );
    }

    public List<Long> getGroupMemberIds(Long groupId) {
        if (groupId == null) {
            return List.of();
        }
        ensureCachesInitialized();
        List<Long> l1Value = groupMemberIdsL1Cache.getIfPresent(groupId);
        if (l1Value != null) {
            recordCacheEvent(CACHE_GROUP_MEMBER_IDS, "l1_hit");
            return l1Value;
        }

        String redisKey = groupMemberIdsCacheKeyPrefix + groupId;
        List<Long> l2Value = toLongList(readRedis(CACHE_GROUP_MEMBER_IDS, redisKey));
        if (l2Value != null) {
            List<Long> immutable = List.copyOf(l2Value);
            groupMemberIdsL1Cache.put(groupId, immutable);
            recordCacheEvent(CACHE_GROUP_MEMBER_IDS, "l2_hit");
            return immutable;
        }

        recordCacheEvent(CACHE_GROUP_MEMBER_IDS, "miss");
        List<Long> loaded = toLongList(groupServiceFeignClient.memberIds(groupId));
        if (loaded != null) {
            List<Long> immutable = List.copyOf(loaded);
            groupMemberIdsL1Cache.put(groupId, immutable);
            writeRedis(CACHE_GROUP_MEMBER_IDS, redisKey, immutable,
                    positive(groupMemberIdsCacheL2TtlSeconds, DEFAULT_GROUP_MEMBER_IDS_L2_TTL_SECONDS),
                    TimeUnit.SECONDS);
            return immutable;
        }
        return List.of();
    }

    @KafkaListener(
            topics = "${im.kafka.authz-cache-invalidation-topic:im-authz-cache-invalidation-topic}",
            containerFactory = "authorizationCacheInvalidationKafkaListenerContainerFactory"
    )
    public void onAuthorizationCacheInvalidation(String payload) {
        if (!StringUtils.hasText(payload)) {
            return;
        }
        try {
            JSONObject jsonObject = JSON.parseObject(payload);
            String scope = jsonObject == null ? null : jsonObject.getString("scope");
            if (SCOPE_FRIEND_RELATION.equals(scope)) {
                invalidateFriendRelation(jsonObject.getList("userIds", Long.class));
                return;
            }
            if (SCOPE_GROUP_MEMBERSHIP.equals(scope)) {
                invalidateGroupMembership(jsonObject.getLong("groupId"), jsonObject.getList("userIds", Long.class));
            }
        } catch (Exception exception) {
            log.warn("Handle authz cache invalidation failed. payload={}, error={}",
                    payload, exception.getMessage(), exception);
        }
    }

    void invalidateFriendRelation(Collection<Long> userIds) {
        ensureCachesInitialized();
        List<Long> normalizedUserIds = normalizeUserIds(userIds);
        if (normalizedUserIds.size() < 2) {
            return;
        }
        for (int left = 0; left < normalizedUserIds.size(); left++) {
            for (int right = 0; right < normalizedUserIds.size(); right++) {
                if (left == right) {
                    continue;
                }
                String cacheKey = normalizedUserIds.get(left) + ":" + normalizedUserIds.get(right);
                friendL1Cache.invalidate(cacheKey);
                deleteRedisKey(CACHE_FRIEND, friendCacheKeyPrefix + cacheKey);
            }
        }
    }

    void invalidateGroupMembership(Long groupId, Collection<Long> userIds) {
        ensureCachesInitialized();
        if (groupId == null) {
            return;
        }
        groupMemberIdsL1Cache.invalidate(groupId);
        deleteRedisKey(CACHE_GROUP_MEMBER_IDS, groupMemberIdsCacheKeyPrefix + groupId);

        for (Long userId : normalizeUserIds(userIds)) {
            String cacheKey = groupId + ":" + userId;
            groupMemberL1Cache.invalidate(cacheKey);
            deleteRedisKey(CACHE_GROUP_MEMBER, groupMemberCacheKeyPrefix + cacheKey);
        }
    }

    private Boolean getBoolean(String cacheName,
                               Cache<String, Boolean> l1Cache,
                               String cacheKey,
                               String redisKey,
                               long l2TtlSeconds,
                               Supplier<Boolean> loader) {
        Boolean l1Value = l1Cache.getIfPresent(cacheKey);
        if (l1Value != null) {
            recordCacheEvent(cacheName, "l1_hit");
            return l1Value;
        }

        Boolean l2Value = toBoolean(readRedis(cacheName, redisKey));
        if (l2Value != null) {
            l1Cache.put(cacheKey, l2Value);
            recordCacheEvent(cacheName, "l2_hit");
            return l2Value;
        }

        recordCacheEvent(cacheName, "miss");
        Boolean loaded = loader.get();
        if (loaded != null) {
            l1Cache.put(cacheKey, loaded);
            writeRedis(cacheName, redisKey, loaded, l2TtlSeconds, TimeUnit.SECONDS);
        }
        return loaded;
    }

    private Object readRedis(String cacheName, String key) {
        try {
            return redisTemplate.opsForValue().get(key);
        } catch (Exception e) {
            recordCacheFailure(cacheName, "l2_read_failed", e);
            return null;
        }
    }

    private void writeRedis(String cacheName, String key, Object value, long ttl, TimeUnit unit) {
        try {
            redisTemplate.opsForValue().set(key, value, ttl, unit);
        } catch (Exception e) {
            recordCacheFailure(cacheName, "l2_write_failed", e);
        }
    }

    private void deleteRedisKey(String cacheName, String key) {
        if (!StringUtils.hasText(key)) {
            return;
        }
        try {
            redisTemplate.delete(key);
            recordCacheEvent(cacheName, "invalidated");
        } catch (Exception exception) {
            recordCacheFailure(cacheName, "invalidate_failed", exception);
        }
    }

    private void ensureCachesInitialized() {
        if (userL1Cache != null) {
            return;
        }
        synchronized (this) {
            if (userL1Cache == null) {
                initCaches();
            }
        }
    }

    private <K, V> Cache<K, V> newCache(long ttlSeconds, long maxSize, long defaultTtlSeconds, long defaultMaxSize) {
        return Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(positive(ttlSeconds, defaultTtlSeconds)))
                .maximumSize(positive(maxSize, defaultMaxSize))
                .build();
    }

    private long positive(long value, long defaultValue) {
        return value > 0 ? value : defaultValue;
    }

    private Boolean toBoolean(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof String text) {
            if ("true".equalsIgnoreCase(text)) {
                return true;
            }
            if ("false".equalsIgnoreCase(text)) {
                return false;
            }
        }
        return null;
    }

    private List<Long> toLongList(Object value) {
        if (!(value instanceof Collection<?> values)) {
            return null;
        }
        List<Long> result = new ArrayList<>(values.size());
        for (Object item : values) {
            Long id = toLong(item);
            if (id != null) {
                result.add(id);
            }
        }
        return result;
    }

    private List<Long> normalizeUserIds(Collection<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return List.of();
        }
        return userIds.stream()
                .filter(value -> value != null)
                .collect(java.util.stream.Collectors.collectingAndThen(
                        java.util.stream.Collectors.toCollection(LinkedHashSet::new),
                        List::copyOf
                ));
    }

    private Long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            try {
                return Long.valueOf(text.trim());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private void recordCacheEvent(String cacheName, String stage) {
        log.debug("Message hotspot cache event. cache={}, stage={}", cacheName, stage);
    }

    private void recordCacheFailure(String cacheName, String stage, Exception e) {
        log.debug("Message hotspot cache failed. cache={}, stage={}, error={}",
                cacheName, stage, e == null ? null : e.getMessage(), e);
        recordCacheEvent(cacheName, stage);
    }
}
