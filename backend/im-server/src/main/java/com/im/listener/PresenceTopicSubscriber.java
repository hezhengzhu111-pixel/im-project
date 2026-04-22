package com.im.listener;

import com.im.config.ImNodeIdentity;
import com.im.dto.PresenceEvent;
import com.im.enums.UserStatus;
import com.im.service.IImService;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Component
@RequiredArgsConstructor
public class PresenceTopicSubscriber {

    private static final long DEFAULT_DELIVERY_CACHE_TTL_MS = 600_000L;
    private static final long MAX_CLEANUP_INTERVAL_MS = TimeUnit.MINUTES.toMillis(1);

    private final RedissonClient redissonClient;
    private final IImService imService;
    private final ImNodeIdentity nodeIdentity;

    @Value("${im.ws.presence-channel:im:presence:broadcast}")
    private String presenceChannel;

    @Value("${im.ws.presence-delivery-cache-ttl-ms:" + DEFAULT_DELIVERY_CACHE_TTL_MS + "}")
    private long presenceDeliveryCacheTtlMs;

    @Autowired(required = false)
    private MeterRegistry meterRegistry;

    private final AtomicBoolean cacheGaugeBound = new AtomicBoolean(false);
    private volatile PresenceDeliveryCache lastDeliveredStatuses;
    private volatile Integer listenerId;
    private volatile RTopic topic;
    private Clock clock = Clock.systemUTC();

    @PostConstruct
    public void subscribe() {
        lastDeliveredStatuses = new PresenceDeliveryCache(resolveDeliveryCacheTtlMs());
        bindCacheGaugeIfNeeded();
        topic = redissonClient.getTopic(presenceChannel);
        listenerId = topic.addListener(PresenceEvent.class, this::handlePresenceEvent);
        log.info("Subscribed Redisson topic for websocket presence. channel={}, listenerId={}",
                presenceChannel, listenerId);
    }

    private void handlePresenceEvent(CharSequence channel, PresenceEvent event) {
        try {
            if (event == null || StringUtils.isBlank(event.getUserId()) || StringUtils.isBlank(event.getStatus())) {
                log.debug("Ignore invalid presence event. channel={}", channel);
                return;
            }
            if (StringUtils.equals(event.getSourceInstanceId(), nodeIdentity.getInstanceId())) {
                return;
            }

            String normalizedUserId = event.getUserId().trim();
            UserStatus status;
            try {
                status = UserStatus.valueOf(event.getStatus().trim().toUpperCase());
            } catch (IllegalArgumentException invalidStatus) {
                log.warn("Ignore presence event with invalid status. channel={}, status={}, sourceInstanceId={}",
                        channel, event.getStatus(), event.getSourceInstanceId());
                return;
            }

            long eventVersion;
            try {
                eventVersion = resolveEventVersion(event);
            } catch (IllegalArgumentException invalidVersion) {
                log.warn("Ignore presence event with invalid version. channel={}, userId={}, sourceInstanceId={}",
                        channel, normalizedUserId, event.getSourceInstanceId());
                return;
            }

            PresenceDeliveryCache cache = lastDeliveredStatuses;
            if (cache == null) {
                log.debug("Ignore presence event after cache shutdown. channel={}, userId={}", channel, normalizedUserId);
                return;
            }

            long nowMillis = clock.millis();
            if (!cache.shouldDeliver(normalizedUserId, eventVersion, nowMillis)) {
                log.debug("Ignore stale presence event. channel={}, userId={}, version={}, sourceInstanceId={}",
                        channel, normalizedUserId, eventVersion, event.getSourceInstanceId());
                return;
            }

            imService.broadcastOnlineStatus(normalizedUserId, status, event.getLastSeen());
        } catch (Exception e) {
            log.warn("Handle presence event failed. channel={}, sourceInstanceId={}, error={}",
                    channel, event == null ? null : event.getSourceInstanceId(), e.getMessage());
        }
    }

    @PreDestroy
    public void unsubscribe() {
        if (topic != null && listenerId != null) {
            topic.removeListener(listenerId);
        }
        PresenceDeliveryCache cache = lastDeliveredStatuses;
        lastDeliveredStatuses = null;
        if (cache != null) {
            cache.clear();
        }
        listenerId = null;
        topic = null;
    }

    private void bindCacheGaugeIfNeeded() {
        if (meterRegistry == null || !cacheGaugeBound.compareAndSet(false, true)) {
            return;
        }
        Gauge.builder("im.websocket.presence.delivery.cache.size", this, PresenceTopicSubscriber::activeCacheEntries)
                .description("Current retained remote presence delivery cache entries")
                .register(meterRegistry);
    }

    private double activeCacheEntries() {
        PresenceDeliveryCache cache = lastDeliveredStatuses;
        if (cache == null) {
            return 0D;
        }
        return cache.size(clock.millis());
    }

    private long resolveEventVersion(PresenceEvent event) {
        if (event != null && event.getEventTime() != null) {
            return event.getEventTime();
        }
        String lastSeen = event == null ? null : StringUtils.trimToNull(event.getLastSeen());
        if (lastSeen == null) {
            throw new IllegalArgumentException("missing comparable presence event version");
        }
        try {
            return Instant.parse(lastSeen).toEpochMilli();
        } catch (DateTimeParseException ignored) {
            try {
                return LocalDateTime.parse(lastSeen)
                        .atZone(resolveClockZone())
                        .toInstant()
                        .toEpochMilli();
            } catch (DateTimeParseException parseException) {
                throw new IllegalArgumentException("invalid comparable presence event version", parseException);
            }
        }
    }

    private long resolveDeliveryCacheTtlMs() {
        return Math.max(1L, presenceDeliveryCacheTtlMs);
    }

    private ZoneId resolveClockZone() {
        ZoneId zoneId = clock == null ? null : clock.getZone();
        return zoneId == null ? ZoneId.systemDefault() : zoneId;
    }

    private static final class PresenceDeliveryCache {
        private final ConcurrentHashMap<String, CacheEntry> entries = new ConcurrentHashMap<>();
        private final long ttlMillis;
        private final long cleanupIntervalMillis;
        private final AtomicLong nextCleanupAtMillis = new AtomicLong(0L);

        private PresenceDeliveryCache(long ttlMillis) {
            this.ttlMillis = Math.max(1L, ttlMillis);
            this.cleanupIntervalMillis = Math.max(1L, Math.min(this.ttlMillis, MAX_CLEANUP_INTERVAL_MS));
        }

        private boolean shouldDeliver(String userId, long version, long nowMillis) {
            cleanupIfDue(nowMillis);
            final boolean[] accepted = new boolean[1];
            entries.compute(userId, (key, existing) -> {
                if (existing != null && existing.expireAtMillis() <= nowMillis) {
                    existing = null;
                }
                if (existing != null && version <= existing.version()) {
                    return existing;
                }
                accepted[0] = true;
                return new CacheEntry(version, nowMillis + ttlMillis);
            });
            return accepted[0];
        }

        private int size(long nowMillis) {
            cleanupExpired(nowMillis);
            return entries.size();
        }

        private void clear() {
            entries.clear();
            nextCleanupAtMillis.set(0L);
        }

        private void cleanupIfDue(long nowMillis) {
            long nextCleanupAt = nextCleanupAtMillis.get();
            if (nowMillis < nextCleanupAt) {
                return;
            }
            if (!nextCleanupAtMillis.compareAndSet(nextCleanupAt, nowMillis + cleanupIntervalMillis)) {
                return;
            }
            cleanupExpired(nowMillis);
        }

        private void cleanupExpired(long nowMillis) {
            entries.entrySet().removeIf(entry -> entry.getValue().expireAtMillis() <= nowMillis);
        }
    }

    private record CacheEntry(long version, long expireAtMillis) {
    }
}
