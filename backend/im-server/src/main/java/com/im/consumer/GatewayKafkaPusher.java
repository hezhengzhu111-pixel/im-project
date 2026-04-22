package com.im.consumer;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONException;
import com.alibaba.fastjson2.JSONObject;
import com.im.dto.*;
import com.im.entity.UserSession;
import com.im.enums.MessageEventType;
import com.im.feign.GroupServiceFeignClient;
import com.im.metrics.ImServerMetrics;
import com.im.service.IImService;
import com.im.service.ProcessedMessageDeduplicator;
import com.im.service.route.UserRouteRegistry;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.Header;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketSession;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Slf4j
@Component
public class GatewayKafkaPusher {

    static final String TARGET_INSTANCE_HEADER = "im-target-instance-id";
    static final String ROUTED_TOPIC_DELIMITER = ".route.";
    private static final String DELIVERY_KEY_PREFIX = "kafka:";
    private static final String SCOPE_GROUP_MEMBERSHIP = "GROUP_MEMBERSHIP";

    private final IImService imService;
    private final RedisTemplate<String, Object> redisTemplate;
    private final ProcessedMessageDeduplicator deduplicator;
    private final GroupServiceFeignClient groupServiceFeignClient;
    private final UserRouteRegistry routeRegistry;
    private final KafkaTemplate<String, Object> routedEventKafkaTemplate;

    @Autowired(required = false)
    private ImServerMetrics metrics;

    @Value("${im.message.group-member-ids-cache.key-prefix:message:group:members:}")
    private String groupMembersCachePrefix;

    @Value("${im.message.group-member-ids-cache.l2-ttl-seconds:30}")
    private long groupMembersCacheTtlSeconds;

    @Value("${im.kafka.chat-topic:im-chat-topic}")
    private String chatTopic;

    @Value("${im.kafka.read-topic:im-read-topic}")
    private String readTopic;

    @Value("${im.kafka.status-topic:im-status-topic}")
    private String statusTopic;

    @Value("${im.kafka.route-send-timeout-ms:2000}")
    private long routeSendTimeoutMs;

    public GatewayKafkaPusher(IImService imService,
                              RedisTemplate<String, Object> redisTemplate,
                              ProcessedMessageDeduplicator deduplicator,
                              GroupServiceFeignClient groupServiceFeignClient,
                              UserRouteRegistry routeRegistry,
                              @Qualifier("gatewayRoutedEventKafkaTemplate") KafkaTemplate<String, Object> routedEventKafkaTemplate) {
        this.imService = imService;
        this.redisTemplate = redisTemplate;
        this.deduplicator = deduplicator;
        this.groupServiceFeignClient = groupServiceFeignClient;
        this.routeRegistry = routeRegistry;
        this.routedEventKafkaTemplate = routedEventKafkaTemplate;
    }

    @KafkaListener(
            topics = "${im.kafka.chat-topic:im-chat-topic}",
            containerFactory = "gatewayMessageEventKafkaListenerContainerFactory"
    )
    public void onMessage(ConsumerRecord<String, MessageEvent> record) {
        if (record == null) {
            return;
        }
        routeMessageEvent(record);
    }

    @KafkaListener(
            topics = "#{__listener.routedMessageTopic}",
            containerFactory = "gatewayRoutedMessageEventKafkaListenerContainerFactory"
    )
    public void onRoutedMessage(ConsumerRecord<String, MessageEvent> record) {
        if (!shouldHandleRoutedRecord(record, getRoutedMessageTopic())) {
            return;
        }
        handleEvent(record.value());
    }

    @KafkaListener(
            topics = "${im.kafka.read-topic:im-read-topic}",
            containerFactory = "gatewayReadEventKafkaListenerContainerFactory"
    )
    public void onReadEvent(ConsumerRecord<String, ReadEvent> record) {
        if (record == null) {
            return;
        }
        routeReadEvent(record);
    }

    @KafkaListener(
            topics = "#{__listener.routedReadTopic}",
            containerFactory = "gatewayRoutedReadEventKafkaListenerContainerFactory"
    )
    public void onRoutedReadEvent(ConsumerRecord<String, ReadEvent> record) {
        if (!shouldHandleRoutedRecord(record, getRoutedReadTopic())) {
            return;
        }
        handleReadEvent(record.value());
    }

    @KafkaListener(
            topics = "${im.kafka.status-topic:im-status-topic}",
            containerFactory = "gatewayStatusChangeEventKafkaListenerContainerFactory"
    )
    public void onStatusChangeEvent(ConsumerRecord<String, StatusChangeEvent> record) {
        if (record == null) {
            return;
        }
        routeStatusChangeEvent(record);
    }

    @KafkaListener(
            topics = "#{__listener.routedStatusTopic}",
            containerFactory = "gatewayRoutedStatusChangeEventKafkaListenerContainerFactory"
    )
    public void onRoutedStatusChangeEvent(ConsumerRecord<String, StatusChangeEvent> record) {
        if (!shouldHandleRoutedRecord(record, getRoutedStatusTopic())) {
            return;
        }
        handleStatusChangeEvent(record.value());
    }

    @KafkaListener(
            topics = "${im.kafka.authz-cache-invalidation-topic:im-authz-cache-invalidation-topic}",
            containerFactory = "gatewayAuthorizationCacheInvalidationKafkaListenerContainerFactory"
    )
    public void onAuthorizationCacheInvalidation(String payload) {
        if (!StringUtils.hasText(payload)) {
            return;
        }
        try {
            JSONObject jsonObject = JSON.parseObject(payload);
            if (jsonObject == null || !SCOPE_GROUP_MEMBERSHIP.equals(jsonObject.getString("scope"))) {
                return;
            }
            Long groupId = jsonObject.getLong("groupId");
            if (groupId == null) {
                return;
            }
            redisTemplate.delete(groupMembersCachePrefix + groupId);
        } catch (Exception exception) {
            log.warn("Handle authz cache invalidation failed. payload={}, error={}",
                    payload, exception.getMessage(), exception);
        }
    }

    public String getRoutedMessageTopic() {
        return routedTopic(chatTopic, currentInstanceId());
    }

    public String getRoutedReadTopic() {
        return routedTopic(readTopic, currentInstanceId());
    }

    public String getRoutedStatusTopic() {
        return routedTopic(statusTopic, currentInstanceId());
    }

    void routeMessageEvent(ConsumerRecord<String, MessageEvent> record) {
        MessageEvent event = record == null ? null : record.value();
        if (event == null || event.getEventType() == null) {
            log.debug("Skip empty Kafka message event.");
            return;
        }

        Set<String> targetInstances;
        switch (event.getEventType()) {
            case MESSAGE, MESSAGE_STATUS_CHANGED -> targetInstances = resolveMessageTargetInstances(event);
            case READ_RECEIPT, READ_SYNC -> targetInstances = resolveEmbeddedReadTargetInstances(event);
            default -> {
                log.debug("Skip unsupported Kafka message event. eventType={}", event.getEventType());
                return;
            }
        }

        routeRecord(chatTopic, record, event, targetInstances);
    }

    void routeReadEvent(ConsumerRecord<String, ReadEvent> record) {
        ReadEvent event = record == null ? null : record.value();
        if (event == null || event.getUserId() == null || !StringUtils.hasText(event.getConversationId())) {
            log.debug("Skip invalid read event.");
            return;
        }
        routeRecord(readTopic, record, event, resolveReadTargetInstances(event));
    }

    void routeStatusChangeEvent(ConsumerRecord<String, StatusChangeEvent> record) {
        StatusChangeEvent event = record == null ? null : record.value();
        if (event == null || event.getMessageId() == null || event.getPayload() == null) {
            log.debug("Skip invalid status change event. messageId={}", event == null ? null : event.getMessageId());
            return;
        }
        routeRecord(statusTopic, record, event, resolveStatusTargetInstances(event));
    }

    void handleEvent(MessageEvent event) {
        if (event == null || event.getEventType() == null) {
            log.debug("Skip empty Kafka message event.");
            return;
        }

        switch (event.getEventType()) {
            case MESSAGE, MESSAGE_STATUS_CHANGED -> pushMessageEvent(event);
            case READ_RECEIPT, READ_SYNC -> pushReadEvent(event);
            default -> log.debug("Skip unsupported Kafka message event. eventType={}", event.getEventType());
        }
    }

    void handleReadEvent(ReadEvent event) {
        if (event == null || event.getUserId() == null || !StringUtils.hasText(event.getConversationId())) {
            log.debug("Skip invalid read event.");
            return;
        }
        ReadReceiptDTO receipt = ReadReceiptDTO.builder()
                .conversationId(event.getConversationId())
                .readerId(event.getUserId())
                .toUserId(event.getTargetUserId())
                .readAt(event.getTimestamp())
                .lastReadMessageId(event.getLastReadMessageId())
                .build();

        if (Boolean.TRUE.equals(event.getGroup()) || event.getGroupId() != null) {
            List<Long> memberIds = resolveGroupMemberIds(event.getGroupId());
            if (memberIds.isEmpty()) {
                return;
            }
            for (Long memberId : memberIds) {
                pushReadReceiptToLocalUser("READ_RECEIPT", buildReadEventKey(event), receipt, memberId);
            }
            return;
        }

        pushReadReceiptToLocalUser("READ_RECEIPT", buildReadEventKey(event), receipt, event.getUserId());
        if (event.getTargetUserId() != null && !event.getTargetUserId().equals(event.getUserId())) {
            pushReadReceiptToLocalUser("READ_RECEIPT", buildReadEventKey(event), receipt, event.getTargetUserId());
        }
    }

    void handleStatusChangeEvent(StatusChangeEvent event) {
        if (event == null || event.getMessageId() == null || event.getPayload() == null) {
            log.debug("Skip invalid status change event. messageId={}", event == null ? null : event.getMessageId());
            return;
        }
        MessageDTO payload = event.getPayload();
        if (Boolean.TRUE.equals(event.getGroup()) || event.getGroupId() != null || payload.isGroup()) {
            List<Long> memberIds = resolveGroupMemberIds(firstNonNull(event.getGroupId(), payload.getGroupId()));
            if (memberIds.isEmpty()) {
                return;
            }
            for (Long memberId : memberIds) {
                pushMessageToLocalUser("MESSAGE_STATUS_CHANGED", buildStatusEventKey(event), payload, memberId);
            }
            return;
        }
        Long senderId = firstNonNull(event.getSenderId(), payload.getSenderId());
        Long receiverId = firstNonNull(event.getReceiverId(), payload.getReceiverId());
        pushMessageToLocalUser("MESSAGE_STATUS_CHANGED", buildStatusEventKey(event), payload, senderId);
        if (receiverId != null && !receiverId.equals(senderId)) {
            pushMessageToLocalUser("MESSAGE_STATUS_CHANGED", buildStatusEventKey(event), payload, receiverId);
        }
    }

    private <T> void routeRecord(String sourceTopic,
                                 ConsumerRecord<String, T> record,
                                 T payload,
                                 Set<String> targetInstances) {
        if (payload == null || CollectionUtils.isEmpty(targetInstances)) {
            return;
        }
        for (String targetInstanceId : targetInstances) {
            if (!StringUtils.hasText(targetInstanceId)) {
                continue;
            }
            sendToInstance(routedTopic(sourceTopic, targetInstanceId), record == null ? null : record.key(), targetInstanceId, payload);
        }
    }

    private void sendToInstance(String topic, String key, String targetInstanceId, Object payload) {
        if (!StringUtils.hasText(topic) || !StringUtils.hasText(targetInstanceId) || payload == null) {
            return;
        }
        ProducerRecord<String, Object> producerRecord = new ProducerRecord<>(topic, key, payload);
        producerRecord.headers().add(TARGET_INSTANCE_HEADER, targetInstanceId.trim().getBytes(StandardCharsets.UTF_8));
        try {
            routedEventKafkaTemplate.send(producerRecord)
                    .get(Math.max(1L, routeSendTimeoutMs), TimeUnit.MILLISECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("route Kafka push interrupted", exception);
        } catch (ExecutionException | TimeoutException exception) {
            throw new IllegalStateException("route Kafka push failed", exception);
        }
    }

    private boolean shouldHandleRoutedRecord(ConsumerRecord<?, ?> record, String expectedTopic) {
        if (record == null || !StringUtils.hasText(expectedTopic)) {
            return false;
        }
        if (!expectedTopic.equals(record.topic())) {
            return false;
        }
        String targetInstanceId = resolveTargetInstanceId(record);
        return !StringUtils.hasText(targetInstanceId) || currentInstanceId().equals(targetInstanceId);
    }

    private String resolveTargetInstanceId(ConsumerRecord<?, ?> record) {
        if (record == null || record.headers() == null) {
            return null;
        }
        Header header = record.headers().lastHeader(TARGET_INSTANCE_HEADER);
        if (header == null || header.value() == null || header.value().length == 0) {
            return null;
        }
        return new String(header.value(), StandardCharsets.UTF_8).trim();
    }

    private Set<String> resolveMessageTargetInstances(MessageEvent event) {
        MessageDTO message = resolveMessagePayload(event);
        if (message == null) {
            log.warn("Skip Kafka message event with empty payload. messageId={}, conversationId={}",
                    event.getMessageId(), event.getConversationId());
            return Set.of();
        }
        if (isGroupEvent(event, message)) {
            return resolveGroupTargetInstances(firstNonNull(event.getGroupId(), message.getGroupId()));
        }
        return resolvePrivateTargetInstances(
                firstNonNull(event.getSenderId(), message.getSenderId()),
                firstNonNull(event.getReceiverId(), message.getReceiverId())
        );
    }

    private Set<String> resolveEmbeddedReadTargetInstances(MessageEvent event) {
        ReadReceiptDTO receipt = resolveReadReceiptPayload(event);
        Long targetUserId = firstNonNull(receipt == null ? null : receipt.getToUserId(), event.getReceiverId());
        if (targetUserId == null) {
            log.debug("Skip read Kafka event without target user. eventType={}, messageId={}",
                    event.getEventType(), event.getMessageId());
            return Set.of();
        }
        return resolvePrivateTargetInstances(targetUserId);
    }

    private Set<String> resolveReadTargetInstances(ReadEvent event) {
        if (Boolean.TRUE.equals(event.getGroup()) || event.getGroupId() != null) {
            return resolveGroupTargetInstances(event.getGroupId());
        }
        return resolvePrivateTargetInstances(event.getUserId(), event.getTargetUserId());
    }

    private Set<String> resolveStatusTargetInstances(StatusChangeEvent event) {
        MessageDTO payload = event.getPayload();
        if (Boolean.TRUE.equals(event.getGroup()) || event.getGroupId() != null || (payload != null && payload.isGroup())) {
            return resolveGroupTargetInstances(firstNonNull(event.getGroupId(), payload == null ? null : payload.getGroupId()));
        }
        Long senderId = firstNonNull(event.getSenderId(), payload == null ? null : payload.getSenderId());
        Long receiverId = firstNonNull(event.getReceiverId(), payload == null ? null : payload.getReceiverId());
        return resolvePrivateTargetInstances(senderId, receiverId);
    }

    private Set<String> resolveGroupTargetInstances(Long groupId) {
        if (groupId == null) {
            return Set.of();
        }
        List<Long> memberIds = resolveGroupMemberIds(groupId);
        if (memberIds.isEmpty()) {
            log.debug("Skip group Kafka event with empty members. groupId={}", groupId);
            return Set.of();
        }
        LinkedHashSet<String> targetInstances = new LinkedHashSet<>();
        for (Long memberId : memberIds) {
            targetInstances.addAll(resolveUserTargetInstances(memberId));
        }
        return targetInstances;
    }

    private Set<String> resolvePrivateTargetInstances(Long... userIds) {
        LinkedHashSet<String> targetInstances = new LinkedHashSet<>();
        if (userIds == null || userIds.length == 0) {
            return targetInstances;
        }
        for (Long userId : userIds) {
            targetInstances.addAll(resolveUserTargetInstances(userId));
        }
        return targetInstances;
    }

    private Set<String> resolveUserTargetInstances(Long userId) {
        if (userId == null) {
            return Set.of();
        }
        Map<String, Integer> instanceSessionCounts = routeRegistry.getInstanceSessionCounts(String.valueOf(userId));
        if (instanceSessionCounts == null || instanceSessionCounts.isEmpty()) {
            return Set.of();
        }
        LinkedHashSet<String> targetInstances = new LinkedHashSet<>();
        for (Map.Entry<String, Integer> entry : instanceSessionCounts.entrySet()) {
            if (StringUtils.hasText(entry.getKey()) && entry.getValue() != null && entry.getValue() > 0) {
                targetInstances.add(entry.getKey().trim());
            }
        }
        return targetInstances;
    }

    private void pushMessageEvent(MessageEvent event) {
        MessageDTO message = resolveMessagePayload(event);
        if (message == null) {
            log.warn("Skip Kafka message event with empty payload. messageId={}, conversationId={}",
                    event.getMessageId(), event.getConversationId());
            return;
        }

        if (isGroupEvent(event, message)) {
            pushGroupMessage(event, message);
            return;
        }
        pushPrivateMessage(event, message);
    }

    private void pushPrivateMessage(MessageEvent event, MessageDTO message) {
        Long senderId = firstNonNull(event.getSenderId(), message.getSenderId());
        Long receiverId = firstNonNull(event.getReceiverId(), message.getReceiverId());
        if (receiverId == null && senderId == null) {
            log.debug("Skip private Kafka message event without sender and receiver. messageId={}", event.getMessageId());
            return;
        }
        String eventType = event.getEventType() == null ? null : event.getEventType().name();
        String eventKey = buildMessageEventKey(event);
        if (receiverId != null) {
            pushMessageToLocalUser(eventType, eventKey, message, receiverId);
        }
        if (senderId != null && !senderId.equals(receiverId)) {
            pushMessageToLocalUser(eventType, eventKey, message, senderId);
        }
    }

    private void pushGroupMessage(MessageEvent event, MessageDTO message) {
        Long groupId = firstNonNull(event.getGroupId(), message.getGroupId());
        if (groupId == null) {
            log.debug("Skip group Kafka message event without groupId. messageId={}", event.getMessageId());
            return;
        }

        List<Long> memberIds = resolveGroupMemberIds(groupId);
        if (memberIds.isEmpty()) {
            log.debug("Skip group Kafka message event with empty members. groupId={}, messageId={}",
                    groupId, event.getMessageId());
            return;
        }

        String eventType = event.getEventType() == null ? null : event.getEventType().name();
        String eventKey = buildMessageEventKey(event);
        for (Long memberId : memberIds) {
            if (memberId == null) {
                continue;
            }
            pushMessageToLocalUser(eventType, eventKey, message, memberId);
        }
    }

    private void pushMessageToLocalUser(String eventType, String eventKey, MessageDTO message, Long targetUserId) {
        List<UserSession> sessions = localSessions(targetUserId);
        if (message == null || sessions.isEmpty()) {
            return;
        }
        String deliveryKey = deliveryKey(eventType, eventKey, targetUserId, null);
        if (!tryReserveDelivery(deliveryKey)) {
            return;
        }

        boolean success = false;
        try {
            success = imService.pushMessageToUser(message, targetUserId);
        } catch (Exception exception) {
            log.warn("Push Kafka message to local user failed. eventType={}, eventKey={}, targetUserId={}, error={}",
                    eventType, eventKey, targetUserId, exception.getMessage(), exception);
        } finally {
            if (!success) {
                releaseDelivery(deliveryKey);
            }
        }
    }

    private void pushReadEvent(MessageEvent event) {
        ReadReceiptDTO receipt = resolveReadReceiptPayload(event);
        Long targetUserId = firstNonNull(receipt == null ? null : receipt.getToUserId(), event.getReceiverId());
        if (receipt == null || targetUserId == null) {
            log.debug("Skip read Kafka event without target user. eventType={}, messageId={}",
                    event.getEventType(), event.getMessageId());
            return;
        }
        String wsType = event.getEventType() == MessageEventType.READ_SYNC ? "READ_SYNC" : "READ_RECEIPT";
        pushReadReceiptToLocalUser(wsType, buildMessageEventKey(event), receipt, targetUserId);
    }

    private MessageDTO resolveMessagePayload(MessageEvent event) {
        MessageDTO payload = event.getPayload();
        boolean groupMessage = isGroupEvent(event, payload);
        if (payload == null) {
            return MessageDTO.builder()
                    .id(event.getMessageId())
                    .clientMessageId(firstText(event.getClientMessageId(), event.getClientMsgId()))
                    .senderId(event.getSenderId())
                    .senderName(event.getSenderName())
                    .senderAvatar(event.getSenderAvatar())
                    .receiverId(event.getReceiverId())
                    .receiverName(event.getReceiverName())
                    .receiverAvatar(event.getReceiverAvatar())
                    .groupId(event.getGroupId())
                    .messageType(event.getMessageType())
                    .content(event.getContent())
                    .mediaUrl(event.getMediaUrl())
                    .mediaSize(event.getMediaSize())
                    .mediaName(event.getMediaName())
                    .thumbnailUrl(event.getThumbnailUrl())
                    .duration(event.getDuration())
                    .locationInfo(event.getLocationInfo())
                    .status(resolveStatusText(event))
                    .replyToMessageId(event.getReplyToMessageId())
                    .createdTime(event.getCreatedTime())
                    .createdAt(event.getCreatedTime())
                    .updatedTime(event.getUpdatedTime())
                    .updatedAt(event.getUpdatedTime())
                    .isGroup(groupMessage)
                    .build();
        }

        if (payload.getId() == null) {
            payload.setId(event.getMessageId());
        }
        if (!StringUtils.hasText(payload.getClientMessageId())) {
            payload.setClientMessageId(firstText(event.getClientMessageId(), event.getClientMsgId()));
        }
        if (payload.getSenderId() == null) {
            payload.setSenderId(event.getSenderId());
        }
        if (payload.getReceiverId() == null) {
            payload.setReceiverId(event.getReceiverId());
        }
        if (payload.getGroupId() == null) {
            payload.setGroupId(event.getGroupId());
        }
        if (payload.getMessageType() == null) {
            payload.setMessageType(event.getMessageType());
        }
        if (!StringUtils.hasText(payload.getStatus())) {
            payload.setStatus(resolveStatusText(event));
        }
        payload.setGroup(groupMessage);
        return payload;
    }

    private ReadReceiptDTO resolveReadReceiptPayload(MessageEvent event) {
        if (event.getReadReceiptPayload() != null) {
            return event.getReadReceiptPayload();
        }
        LocalDateTime readAt = event.getUpdatedTime() == null ? event.getCreatedTime() : event.getUpdatedTime();
        return ReadReceiptDTO.builder()
                .conversationId(event.getConversationId())
                .readerId(event.getSenderId())
                .toUserId(event.getReceiverId())
                .readAt(readAt)
                .lastReadMessageId(event.getMessageId())
                .build();
    }

    private List<Long> resolveGroupMemberIds(Long groupId) {
        if (groupId == null) {
            return List.of();
        }
        String cacheKey = groupMembersCachePrefix + groupId;
        List<Long> cachedMemberIds = readGroupMembersFromCache(cacheKey, groupId);
        if (cachedMemberIds != null) {
            return cachedMemberIds;
        }
        return loadGroupMembersFromSource(cacheKey, groupId);
    }

    private List<Long> readGroupMembersFromCache(String cacheKey, Long groupId) {
        try {
            Object value = redisTemplate.opsForValue().get(cacheKey);
            if (value == null) {
                return null;
            }
            return normalizeMemberIds(value);
        } catch (Exception exception) {
            log.warn("Read group member cache failed. groupId={}, key={}, error={}",
                    groupId, cacheKey, exception.getMessage());
            return null;
        }
    }

    private List<Long> loadGroupMembersFromSource(String cacheKey, Long groupId) {
        try {
            List<Long> memberIds = distinct(groupServiceFeignClient.memberIds(groupId));
            try {
                redisTemplate.opsForValue().set(cacheKey, memberIds, Math.max(1L, groupMembersCacheTtlSeconds), TimeUnit.SECONDS);
            } catch (Exception exception) {
                log.warn("Backfill group member cache failed. groupId={}, key={}, error={}",
                        groupId, cacheKey, exception.getMessage());
            }
            return memberIds;
        } catch (Exception exception) {
            log.warn("Load group members from source failed. groupId={}, error={}",
                    groupId, exception.getMessage(), exception);
            return List.of();
        }
    }

    private List<Long> normalizeMemberIds(Object value) {
        if (value == null) {
            return List.of();
        }
        List<Long> memberIds = new ArrayList<>();
        if (value instanceof Collection<?> collection) {
            for (Object item : collection) {
                appendMemberId(memberIds, item);
            }
            return distinct(memberIds);
        }
        if (value instanceof Object[] array) {
            for (Object item : array) {
                appendMemberId(memberIds, item);
            }
            return distinct(memberIds);
        }
        if (value instanceof String text) {
            if (!StringUtils.hasText(text)) {
                return List.of();
            }
            try {
                return distinct(JSON.parseArray(text, Long.class));
            } catch (JSONException ignored) {
                for (String item : text.split(",")) {
                    appendMemberId(memberIds, item);
                }
                return distinct(memberIds);
            }
        }
        appendMemberId(memberIds, value);
        return distinct(memberIds);
    }

    private void appendMemberId(List<Long> memberIds, Object value) {
        Long memberId = toLong(value);
        if (memberId != null) {
            memberIds.add(memberId);
        }
    }

    private Long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            try {
                return Long.valueOf(text.trim());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private List<Long> distinct(List<Long> memberIds) {
        if (CollectionUtils.isEmpty(memberIds)) {
            return List.of();
        }
        Set<Long> distinct = new LinkedHashSet<>(memberIds);
        return List.copyOf(distinct);
    }

    private boolean isGroupEvent(MessageEvent event, MessageDTO payload) {
        return Boolean.TRUE.equals(event.getGroup())
                || event.getGroupId() != null
                || (payload != null && payload.isGroup());
    }

    private List<UserSession> localSessions(Long userId) {
        if (userId == null) {
            return List.of();
        }
        List<UserSession> sessions = imService.getLocalSessions(String.valueOf(userId));
        return sessions == null ? List.of() : sessions;
    }

    private String resolveSessionId(UserSession session) {
        if (session == null) {
            return null;
        }
        WebSocketSession webSocketSession = session.getWebSocketSession();
        return webSocketSession == null ? null : webSocketSession.getId();
    }

    private boolean tryReserveDelivery(String deliveryKey) {
        if (!StringUtils.hasText(deliveryKey)) {
            return true;
        }
        boolean reserved = deduplicator.tryReserve(deliveryKey);
        if (!reserved && metrics != null) {
            metrics.recordDuplicateDeliveryPrevented();
        }
        return reserved;
    }

    private void releaseDelivery(String deliveryKey) {
        if (StringUtils.hasText(deliveryKey)) {
            deduplicator.release(deliveryKey);
        }
    }

    private void pushReadReceiptToLocalUser(String wsType,
                                            String eventKey,
                                            ReadReceiptDTO receipt,
                                            Long targetUserId) {
        List<UserSession> sessions = localSessions(targetUserId);
        if (receipt == null || sessions.isEmpty()) {
            return;
        }
        for (UserSession session : sessions) {
            String sessionId = resolveSessionId(session);
            if (!StringUtils.hasText(sessionId)) {
                continue;
            }
            String deliveryKey = deliveryKey(wsType, eventKey, targetUserId, sessionId);
            if (!tryReserveDelivery(deliveryKey)) {
                continue;
            }
            boolean success = false;
            try {
                success = imService.pushReadReceiptToSession(receipt, sessionId, wsType);
            } catch (Exception exception) {
                log.warn("Push Kafka read receipt to local session failed. wsType={}, eventKey={}, targetUserId={}, sessionId={}, error={}",
                        wsType, eventKey, targetUserId, sessionId, exception.getMessage(), exception);
            } finally {
                if (!success) {
                    releaseDelivery(deliveryKey);
                }
            }
        }
    }

    private String deliveryKey(String eventType, String eventKey, Long targetUserId, String sessionId) {
        if (!StringUtils.hasText(eventType) || !StringUtils.hasText(eventKey) || targetUserId == null) {
            return null;
        }
        StringBuilder builder = new StringBuilder(DELIVERY_KEY_PREFIX)
                .append(eventType)
                .append(':')
                .append(eventKey)
                .append(':')
                .append(targetUserId);
        if (StringUtils.hasText(sessionId)) {
            builder.append(':').append(sessionId.trim());
        }
        return builder.toString();
    }

    private String buildMessageEventKey(MessageEvent event) {
        if (event == null) {
            return null;
        }
        if (event.getMessageId() != null) {
            return String.valueOf(event.getMessageId());
        }
        return firstText(event.getClientMessageId(), event.getClientMsgId());
    }

    private String buildReadEventKey(ReadEvent event) {
        if (event == null) {
            return null;
        }
        if (event.getLastReadMessageId() != null) {
            return String.valueOf(event.getLastReadMessageId());
        }
        if (event.getTimestamp() != null) {
            return event.getConversationId() + ":" + event.getUserId() + ":" + event.getTimestamp();
        }
        return event.getConversationId() + ":" + event.getUserId();
    }

    private String buildStatusEventKey(StatusChangeEvent event) {
        if (event == null || event.getMessageId() == null) {
            return null;
        }
        return event.getMessageId() + ":" + event.getNewStatus();
    }

    private String resolveStatusText(MessageEvent event) {
        if (StringUtils.hasText(event.getStatusText())) {
            return event.getStatusText();
        }
        return event.getStatus() == null ? null : String.valueOf(event.getStatus());
    }

    private String firstText(String first, String second) {
        return StringUtils.hasText(first) ? first : second;
    }

    private <T> T firstNonNull(T first, T second) {
        return first != null ? first : second;
    }

    private String routedTopic(String sourceTopic, String instanceId) {
        if (!StringUtils.hasText(sourceTopic) || !StringUtils.hasText(instanceId)) {
            return sourceTopic;
        }
        return sourceTopic.trim() + ROUTED_TOPIC_DELIMITER + sanitizeInstanceId(instanceId);
    }

    private String currentInstanceId() {
        String instanceId = imService.getCurrentInstanceId();
        return StringUtils.hasText(instanceId) ? instanceId.trim() : "unknown";
    }

    private String sanitizeInstanceId(String instanceId) {
        if (!StringUtils.hasText(instanceId)) {
            return "unknown";
        }
        return instanceId.trim().replaceAll("[^A-Za-z0-9._-]", "_");
    }
}
