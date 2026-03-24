package com.im.service;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.dto.WsPushEvent;
import com.im.entity.MessageOutboxEvent;
import com.im.mapper.MessageOutboxMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class OutboxPublisher {

    private static final String EVENT_TYPE_MESSAGE = "MESSAGE";
    private static final String EVENT_TYPE_READ_RECEIPT = "READ_RECEIPT";
    private static final int WS_PUSH_EVENT_VERSION = 1;
    private static final int MAX_ERROR_LEN = 1024;

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final MessageOutboxMapper outboxMapper;
    private final StringRedisTemplate stringRedisTemplate;

    @Value("${im.outbox.max-attempts:20}")
    private int maxAttempts;

    @Value("${im.outbox.batch-size:100}")
    private int batchSize;

    @Value("${im.outbox.base-backoff-ms:1000}")
    private long baseBackoffMs;

    @Value("${im.outbox.send-timeout-ms:30000}")
    private long sendTimeoutMs;

    @Value("${im.outbox.recover-sending-timeout-ms:120000}")
    private long recoverSendingTimeoutMs;

    @Value("${im.kafka.topic.push-prefix:im-ws-push-}")
    private String wsPushTopicPrefix;

    @Value("${im.route.user-key-prefix:im:route:user:}")
    private String routeUserKeyPrefix;

    @Value("${im.kafka.topic.private-message:im-private-message-topic}")
    private String privateMessageTopic;

    @Value("${im.kafka.topic.group-message:im-group-message-topic}")
    private String groupMessageTopic;

    @Value("${im.kafka.topic.read-receipt:im-read-receipt-topic}")
    private String readReceiptTopic;

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
                String kafkaPayload = JSON.toJSONString(wsPushEvent);
                String key = buildKafkaKey(event.getMessageKey(), dispatch.routeInstanceId());
                kafkaTemplate.send(dispatch.topic(), key, kafkaPayload)
                        .get(Math.max(1000L, sendTimeoutMs), TimeUnit.MILLISECONDS);
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
            log.warn("Outbox publish failed. id={}, attempts={}, topic={}, err={}",
                    outboxId, attemptsAfterUpdate, snapshot == null ? null : snapshot.getTopic(), err);
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
            String instanceId = resolveRouteInstance(userId);
            if (!StringUtils.hasText(instanceId)) {
                unroutableUserIds.add(userId);
                continue;
            }
            usersByInstance.computeIfAbsent(instanceId, key -> new ArrayList<>()).add(userId);
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
                        wsPushTopicPrefix + entry.getKey(),
                        entry.getKey(),
                        eventPayload.eventType(),
                        eventPayload.messageId(),
                        deduplicate(entry.getValue())))
                .collect(Collectors.toList());
    }

    private EventPayload parseEventPayload(MessageOutboxEvent event) {
        String topic = event.getTopic();
        if (readReceiptTopic.equals(topic)) {
            ReadReceiptDTO receipt = JSON.parseObject(event.getPayload(), ReadReceiptDTO.class);
            List<Long> targets = receipt == null || receipt.getToUserId() == null
                    ? List.of()
                    : List.of(receipt.getToUserId());
            Long messageId = receipt == null ? null : receipt.getLastReadMessageId();
            return new EventPayload(EVENT_TYPE_READ_RECEIPT, messageId, targets);
        }
        if (privateMessageTopic.equals(topic) || groupMessageTopic.equals(topic)) {
            MessageDTO messageDTO = JSON.parseObject(event.getPayload(), MessageDTO.class);
            List<Long> targets = extractMessageTargets(messageDTO);
            Long messageId = messageDTO == null ? null : messageDTO.getId();
            return new EventPayload(EVENT_TYPE_MESSAGE, messageId, targets);
        }
        throw new IllegalArgumentException("unsupported outbox topic: " + topic);
    }

    private List<Long> extractMessageTargets(MessageDTO messageDTO) {
        if (messageDTO == null) {
            return List.of();
        }
        if (messageDTO.getReceiverId() != null) {
            return List.of(messageDTO.getReceiverId());
        }
        if (messageDTO.getGroupMembers() == null || messageDTO.getGroupMembers().isEmpty()) {
            return List.of();
        }
        return messageDTO.getGroupMembers().stream()
                .filter(member -> member != null && member.getUserId() != null)
                .map(member -> member.getUserId())
                .collect(Collectors.toList());
    }

    private String resolveRouteInstance(Long userId) {
        if (userId == null) {
            return null;
        }
        return stringRedisTemplate.opsForValue().get(routeUserKeyPrefix + userId);
    }

    private List<Long> deduplicate(List<Long> source) {
        if (source == null || source.isEmpty()) {
            return List.of();
        }
        return source.stream().distinct().collect(Collectors.toList());
    }

    private String buildKafkaKey(String originalKey, String routeInstanceId) {
        if (!StringUtils.hasText(originalKey)) {
            return routeInstanceId;
        }
        return originalKey + ":" + routeInstanceId;
    }

    private long calculateBackoffMs(int attempts) {
        int normalized = Math.max(1, attempts);
        long multiplier = 1L << Math.min(10, normalized - 1);
        return baseBackoffMs * multiplier;
    }

    private record EventPayload(String eventType, Long messageId, List<Long> targetUserIds) {
    }

    private record RouteDispatch(String topic, String routeInstanceId, String eventType, Long messageId,
                                 List<Long> targetUserIds) {
    }
}
