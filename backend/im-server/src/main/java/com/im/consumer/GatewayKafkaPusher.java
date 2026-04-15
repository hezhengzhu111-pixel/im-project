package com.im.consumer;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONException;
import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.dto.ReadReceiptDTO;
import com.im.entity.UserSession;
import com.im.enums.MessageEventType;
import com.im.feign.GroupServiceFeignClient;
import com.im.service.IImService;
import com.im.service.ProcessedMessageDeduplicator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketSession;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class GatewayKafkaPusher {

    private static final String DELIVERY_KEY_PREFIX = "kafka:";

    private final IImService imService;
    private final RedisTemplate<String, Object> redisTemplate;
    private final GroupServiceFeignClient groupServiceFeignClient;
    private final ProcessedMessageDeduplicator deduplicator;

    @Value("${im.message.group-member-ids-cache.key-prefix:message:group:members:}")
    private String groupMembersCachePrefix;

    @Value("${im.message.group-member-ids-cache.l2-ttl-seconds:30}")
    private long groupMembersCacheTtlSeconds;

    @KafkaListener(
            topics = "${im.kafka.chat-topic:im-chat-topic}",
            containerFactory = "gatewayMessageEventKafkaListenerContainerFactory"
    )
    public void onMessage(ConsumerRecord<String, MessageEvent> record) {
        if (record == null) {
            return;
        }
        handleEvent(record.value());
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
        Long receiverId = firstNonNull(event.getReceiverId(), message.getReceiverId());
        if (receiverId == null) {
            log.debug("Skip private Kafka message event without receiver. messageId={}", event.getMessageId());
            return;
        }
        pushMessageToLocalUser(event, message, receiverId);
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

        for (Long memberId : memberIds) {
            if (memberId == null || memberId.equals(event.getSenderId())) {
                continue;
            }
            pushMessageToLocalUser(event, message, memberId);
        }
    }

    private void pushMessageToLocalUser(MessageEvent event, MessageDTO message, Long targetUserId) {
        if (!hasLocalSessions(targetUserId)) {
            return;
        }
        String deliveryKey = deliveryKey(event, targetUserId);
        if (alreadyDelivered(deliveryKey)) {
            return;
        }

        boolean success = false;
        try {
            success = imService.pushMessageToUser(message, targetUserId);
        } catch (Exception exception) {
            log.warn("Push Kafka message event to local user failed. messageId={}, targetUserId={}, error={}",
                    event.getMessageId(), targetUserId, exception.getMessage(), exception);
        }
        if (success) {
            markDelivered(deliveryKey);
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

        List<UserSession> sessions = localSessions(targetUserId);
        if (sessions.isEmpty()) {
            return;
        }

        String wsType = event.getEventType() == MessageEventType.READ_SYNC ? "READ_SYNC" : "READ_RECEIPT";
        for (UserSession session : sessions) {
            String sessionId = resolveSessionId(session);
            if (!StringUtils.hasText(sessionId)) {
                continue;
            }
            String deliveryKey = deliveryKey(event, targetUserId, sessionId);
            if (alreadyDelivered(deliveryKey)) {
                continue;
            }
            try {
                if (imService.pushReadReceiptToSession(receipt, sessionId, wsType)) {
                    markDelivered(deliveryKey);
                }
            } catch (Exception exception) {
                log.warn("Push Kafka read event to local session failed. eventType={}, messageId={}, targetUserId={}, sessionId={}, error={}",
                        event.getEventType(), event.getMessageId(), targetUserId, sessionId, exception.getMessage(), exception);
            }
        }
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
        String cacheKey = groupMembersCachePrefix + groupId;
        List<Long> cachedMemberIds = readGroupMembersFromCache(cacheKey, groupId);
        if (!cachedMemberIds.isEmpty()) {
            return cachedMemberIds;
        }

        List<Long> fetchedMemberIds = fetchGroupMemberIds(groupId);
        if (!fetchedMemberIds.isEmpty()) {
            writeGroupMembersToCache(cacheKey, fetchedMemberIds, groupId);
        }
        return fetchedMemberIds;
    }

    private List<Long> readGroupMembersFromCache(String cacheKey, Long groupId) {
        try {
            Object value = redisTemplate.opsForValue().get(cacheKey);
            return normalizeMemberIds(value);
        } catch (Exception exception) {
            log.warn("Read group member cache failed. groupId={}, key={}, error={}",
                    groupId, cacheKey, exception.getMessage());
            return List.of();
        }
    }

    private List<Long> fetchGroupMemberIds(Long groupId) {
        try {
            return normalizeMemberIds(groupServiceFeignClient.memberIds(groupId));
        } catch (Exception exception) {
            log.warn("Fetch group members from group-service failed. groupId={}, error={}",
                    groupId, exception.getMessage(), exception);
            return List.of();
        }
    }

    private void writeGroupMembersToCache(String cacheKey, List<Long> memberIds, Long groupId) {
        try {
            long ttlSeconds = Math.max(1L, groupMembersCacheTtlSeconds);
            redisTemplate.opsForValue().set(cacheKey, new ArrayList<>(memberIds), Duration.ofSeconds(ttlSeconds));
        } catch (Exception exception) {
            log.warn("Write group member cache failed. groupId={}, key={}, error={}",
                    groupId, cacheKey, exception.getMessage());
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

    private boolean hasLocalSessions(Long userId) {
        return !localSessions(userId).isEmpty();
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

    private boolean alreadyDelivered(String deliveryKey) {
        return StringUtils.hasText(deliveryKey) && deduplicator.isProcessed(deliveryKey);
    }

    private void markDelivered(String deliveryKey) {
        if (StringUtils.hasText(deliveryKey)) {
            deduplicator.markProcessed(deliveryKey);
        }
    }

    private String deliveryKey(MessageEvent event, Long targetUserId) {
        return deliveryKey(event, targetUserId, null);
    }

    private String deliveryKey(MessageEvent event, Long targetUserId, String sessionId) {
        if (event == null || targetUserId == null) {
            return null;
        }
        String eventKey = event.getMessageId() == null
                ? firstText(event.getClientMessageId(), event.getClientMsgId())
                : String.valueOf(event.getMessageId());
        if (!StringUtils.hasText(eventKey)) {
            return null;
        }
        StringBuilder builder = new StringBuilder(DELIVERY_KEY_PREFIX)
                .append(event.getEventType())
                .append(':')
                .append(eventKey)
                .append(':')
                .append(targetUserId);
        if (StringUtils.hasText(sessionId)) {
            builder.append(':').append(sessionId.trim());
        }
        return builder.toString();
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
}
