package com.im.consumer;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONException;
import com.im.dto.*;
import com.im.entity.UserSession;
import com.im.enums.MessageEventType;
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

import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Component
@RequiredArgsConstructor
public class GatewayKafkaPusher {

    private static final String DELIVERY_KEY_PREFIX = "kafka:";

    private final IImService imService;
    private final RedisTemplate<String, Object> redisTemplate;
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

    @KafkaListener(
            topics = "${im.kafka.read-topic:im-read-topic}",
            containerFactory = "gatewayReadEventKafkaListenerContainerFactory"
    )
    public void onReadEvent(ConsumerRecord<String, ReadEvent> record) {
        if (record == null) {
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
        handleStatusChangeEvent(record.value());
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

    private void pushMessageToLocalUser(MessageEvent event, MessageDTO message, Long targetUserId) {
        pushMessageToLocalUser(event == null || event.getEventType() == null ? null : event.getEventType().name(),
                buildMessageEventKey(event), message, targetUserId);
    }

    private void pushMessageToLocalUser(String eventType, String eventKey, MessageDTO message, Long targetUserId) {
        if (!hasLocalSessions(targetUserId)) {
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
        String cacheKey = groupMembersCachePrefix + groupId;
        return readGroupMembersFromCache(cacheKey, groupId);
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

    private boolean tryReserveDelivery(String deliveryKey) {
        return !StringUtils.hasText(deliveryKey) || deduplicator.tryReserve(deliveryKey);
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

    private String deliveryKey(MessageEvent event, Long targetUserId) {
        return deliveryKey(event, targetUserId, null);
    }

    private String deliveryKey(MessageEvent event, Long targetUserId, String sessionId) {
        if (event == null || targetUserId == null) {
            return null;
        }
        return deliveryKey(event.getEventType() == null ? null : event.getEventType().name(),
                buildMessageEventKey(event),
                targetUserId,
                sessionId);
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
}
