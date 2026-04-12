package com.im.service;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.dto.WsPushEvent;
import com.im.mapper.MessageOutboxMapper;
import com.im.message.entity.MessageOutboxEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RSetMultimap;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class OutboxPublisher {

    private static final String EVENT_TYPE_MESSAGE = "MESSAGE";
    private static final String EVENT_TYPE_READ_RECEIPT = "READ_RECEIPT";
    private static final int WS_PUSH_EVENT_VERSION = 1;
    private static final int MAX_ERROR_LEN = 1024;

    private final MessageOutboxMapper outboxMapper;
    private final RedissonClient redissonClient;

    @Value("${im.outbox.max-attempts:20}")
    private int maxAttempts;

    @Value("${im.outbox.batch-size:100}")
    private int batchSize;

    @Value("${im.outbox.base-backoff-ms:1000}")
    private long baseBackoffMs;

    @Value("${im.outbox.recover-sending-timeout-ms:120000}")
    private long recoverSendingTimeoutMs;

    @Value("${im.ws.channel-prefix:im:channel:}")
    private String wsChannelPrefix;

    @Value("${im.route.users-key:im:route:users}")
    private String routeUsersKey;

    @Value("${im.route.lease-key-prefix:im:route:lease:}")
    private String routeLeaseKeyPrefix;

    public void publishById(Long outboxId) {
        if (outboxId == null) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        int claimed = outboxMapper.claimEventForSending(outboxId, now, maxAttempts);
        if (claimed <= 0) {
            return;
        }
        MessageOutboxEvent event = outboxMapper.selectById(outboxId);
        if (event == null) {
            markFailed(outboxId, new IllegalStateException("outbox event missing after claim"));
            return;
        }
        try {
            List<RouteDispatch> dispatches = buildDispatches(event);
            if (dispatches.isEmpty()) {
                markSent(outboxId);
                return;
            }
            for (RouteDispatch dispatch : dispatches) {
                WsPushEvent wsPushEvent = WsPushEvent.builder()
                        .eventId(String.valueOf(event.getId()))
                        .eventType(dispatch.eventType())
                        .messageId(dispatch.messageId())
                        .targetUserIds(dispatch.targetUserIds())
                        .payload(event.getPayload())
                        .createdAt(LocalDateTime.now())
                        .version(WS_PUSH_EVENT_VERSION)
                        .build();
                RTopic topic = redissonClient.getTopic(dispatch.channel());
                topic.publish(wsPushEvent);
            }
            markSent(outboxId);
        } catch (Exception ex) {
            markFailed(outboxId, ex);
        }
    }

    @Scheduled(fixedDelayString = "${im.outbox.retry-interval-ms:5000}")
    public void retryDueEvents() {
        List<Long> dueIds = outboxMapper.selectDueEventIds(LocalDateTime.now(), batchSize, maxAttempts);
        for (Long id : dueIds) {
            publishById(id);
        }
    }

    @Scheduled(fixedDelayString = "${im.outbox.recover-sending-interval-ms:60000}")
    public void recoverStuckSending() {
        long timeoutMs = Math.max(1000L, recoverSendingTimeoutMs);
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime staleBefore = now.minusNanos(timeoutMs * 1_000_000);
        int recovered = outboxMapper.recoverStuckSending(now, staleBefore, maxAttempts);
        if (recovered > 0) {
            log.warn("Recovered stuck outbox events. recovered={}", recovered);
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markSent(Long outboxId) {
        outboxMapper.markSent(outboxId, LocalDateTime.now());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(Long outboxId, Throwable ex) {
        MessageOutboxEvent snapshot = outboxMapper.selectById(outboxId);
        int attemptsAfterUpdate = (snapshot == null || snapshot.getAttempts() == null ? 0 : snapshot.getAttempts()) + 1;
        LocalDateTime nextRetryAt = LocalDateTime.now().plusNanos(calculateBackoffMs(attemptsAfterUpdate) * 1_000_000);
        String err = ex == null ? "unknown" : String.valueOf(ex.getMessage());
        if (!StringUtils.hasText(err)) {
            err = ex == null ? "unknown" : ex.getClass().getSimpleName();
        }
        if (err.length() > MAX_ERROR_LEN) {
            err = err.substring(0, MAX_ERROR_LEN);
        }
        int updated = outboxMapper.markFailed(outboxId, err, nextRetryAt);
        if (updated > 0) {
            log.warn("Outbox publish failed. id={}, attempts={}, eventType={}, err={}",
                    outboxId, attemptsAfterUpdate, snapshot == null ? null : snapshot.getEventType(), err);
        } else {
            log.debug("Outbox markFailed skipped due to status mismatch. id={}", outboxId);
        }
    }

    private List<RouteDispatch> buildDispatches(MessageOutboxEvent event) {
        EventPayload eventPayload = parseEventPayload(event);
        if (eventPayload.targetUserIds().isEmpty()) {
            return List.of();
        }

        Map<String, List<Long>> usersByInstance = new LinkedHashMap<>();
        List<Long> unroutableUserIds = new ArrayList<>();
        for (Long userId : eventPayload.targetUserIds()) {
            Set<String> instanceIds = resolveRouteInstances(userId);
            if (instanceIds.isEmpty()) {
                unroutableUserIds.add(userId);
                continue;
            }
            for (String instanceId : instanceIds) {
                usersByInstance.computeIfAbsent(instanceId, key -> new ArrayList<>()).add(userId);
            }
        }

        if (!unroutableUserIds.isEmpty()) {
            log.warn("Skip ws push due to missing route. outboxId={}, eventType={}, users={}",
                    event.getId(), eventPayload.eventType(), unroutableUserIds);
        }
        if (usersByInstance.isEmpty()) {
            return List.of();
        }
        return usersByInstance.entrySet().stream()
                .map(entry -> new RouteDispatch(
                        wsChannelPrefix + entry.getKey(),
                        eventPayload.eventType(),
                        eventPayload.messageId(),
                        deduplicate(entry.getValue())))
                .collect(Collectors.toList());
    }

    private EventPayload parseEventPayload(MessageOutboxEvent event) {
        String eventType = normalizeEventType(event.getEventType());
        List<Long> targets = JSON.parseArray(event.getTargetsJson(), Long.class);
        if (targets == null) {
            targets = List.of();
        }
        Long messageId = event.getRelatedMessageId();
        if (messageId == null && EVENT_TYPE_MESSAGE.equals(eventType)) {
            MessageDTO messageDTO = JSON.parseObject(event.getPayload(), MessageDTO.class);
            messageId = messageDTO == null ? null : messageDTO.getId();
        }
        if (messageId == null && EVENT_TYPE_READ_RECEIPT.equals(eventType)) {
            ReadReceiptDTO receipt = JSON.parseObject(event.getPayload(), ReadReceiptDTO.class);
            messageId = receipt == null ? null : receipt.getLastReadMessageId();
        }
        return new EventPayload(eventType, messageId, deduplicate(targets));
    }

    private Set<String> resolveRouteInstances(Long userId) {
        if (userId == null) {
            return Set.of();
        }
        String userIdStr = String.valueOf(userId);
        RSetMultimap<String, String> routeMultimap = redissonClient.getSetMultimap(routeUsersKey);
        Set<String> routeInstances = new LinkedHashSet<>(routeMultimap.getAll(userIdStr));
        if (routeInstances.isEmpty()) {
            return Set.of();
        }

        Set<String> liveInstances = new LinkedHashSet<>();
        for (String instanceId : routeInstances) {
            if (!StringUtils.hasText(instanceId)) {
                continue;
            }
            String normalizedInstanceId = instanceId.trim();
            if (redissonClient.getBucket(routeLeaseKeyPrefix + userIdStr + ":" + normalizedInstanceId).isExists()) {
                liveInstances.add(normalizedInstanceId);
                continue;
            }
            routeMultimap.remove(userIdStr, normalizedInstanceId);
        }
        return liveInstances;
    }

    private String normalizeEventType(String eventType) {
        if (!StringUtils.hasText(eventType)) {
            return EVENT_TYPE_MESSAGE;
        }
        return eventType.trim().toUpperCase();
    }

    private List<Long> deduplicate(List<Long> source) {
        if (source == null || source.isEmpty()) {
            return List.of();
        }
        return source.stream().filter(item -> item != null).distinct().collect(Collectors.toList());
    }

    private long calculateBackoffMs(int attempts) {
        int normalized = Math.max(1, attempts);
        long multiplier = 1L << Math.min(10, normalized - 1);
        return baseBackoffMs * multiplier;
    }

    private record EventPayload(String eventType, Long messageId, List<Long> targetUserIds) {
    }

    private record RouteDispatch(String channel,
                                 String eventType,
                                 Long messageId,
                                 List<Long> targetUserIds) {
    }
}
