package com.im.service;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
import com.im.enums.MessageEventType;
import com.im.service.support.UserProfileCache;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ConversationCacheUpdater {

    private static final String LAST_MESSAGE_FIELD = "message";
    private static final byte[] ZERO_BYTES = "0".getBytes(StandardCharsets.UTF_8);

    private final RedisTemplate<String, Object> redisTemplate;
    private final UserProfileCache userProfileCache;

    @Value("${im.message.conversation-cache.last-message-key-prefix:last_message:}")
    private String lastMessageKeyPrefix;

    @Value("${im.message.conversation-cache.user-index-key-prefix:conversation:index:user:}")
    private String userIndexKeyPrefix;

    @Value("${im.message.conversation-cache.user-unread-key-prefix:conversation:unread:user:}")
    private String userUnreadKeyPrefix;

    @Value("${im.message.conversation-cache.legacy-list-key-prefix:conversations:user:}")
    private String legacyConversationListKeyPrefix;

    @Value("${im.message.conversation-cache.ttl-seconds:3600}")
    private long cacheTtlSeconds;

    public void updateMessages(List<MessageEvent> events) {
        if (events == null || events.isEmpty()) {
            return;
        }

        Map<Long, List<Long>> groupMemberIdsCache = new HashMap<>();
        for (MessageEvent event : events) {
            updateMessage(event, groupMemberIdsCache);
        }
    }

    public void markConversationRead(ReadEvent event) {
        if (event == null || event.getUserId() == null || !StringUtils.hasText(event.getConversationId())) {
            return;
        }
        setUnreadCount(event.getUserId(), event.getConversationId().trim(), 0L);
        clearLegacyConversationListCache(event.getUserId());
    }

    public void applyStatusChange(StatusChangeEvent event) {
        if (event == null || event.getMessageId() == null) {
            return;
        }
        String conversationId = resolveConversationId(event);
        if (!StringUtils.hasText(conversationId) || event.getPayload() == null) {
            return;
        }

        String lastMessageKey = lastMessageKeyPrefix + conversationId;
        try {
            Object cachedValue = redisTemplate.opsForHash().get(lastMessageKey, LAST_MESSAGE_FIELD);
            if (!(cachedValue instanceof MessageDTO cachedMessage)) {
                return;
            }
            if (cachedMessage.getId() == null || !event.getMessageId().equals(cachedMessage.getId())) {
                return;
            }
            redisTemplate.opsForHash().put(lastMessageKey, LAST_MESSAGE_FIELD, event.getPayload());
            redisTemplate.expire(lastMessageKey, Duration.ofSeconds(resolveCacheTtlSeconds()));
        } catch (Exception exception) {
            log.warn("Update conversation last message status cache failed. conversationId={}, messageId={}, error={}",
                    conversationId, event.getMessageId(), exception.getMessage(), exception);
        }

        Long groupId = event.getGroupId() != null
                ? event.getGroupId()
                : event.getPayload() == null ? null : event.getPayload().getGroupId();
        if (groupId != null || Boolean.TRUE.equals(event.getGroup())) {
            List<Long> memberIds = userProfileCache.getGroupMemberIds(groupId);
            if (memberIds != null) {
                for (Long memberId : memberIds) {
                    clearLegacyConversationListCache(memberId);
                }
            }
            return;
        }

        if (event.getSenderId() != null) {
            clearLegacyConversationListCache(event.getSenderId());
        }
        if (event.getReceiverId() != null) {
            clearLegacyConversationListCache(event.getReceiverId());
        }
    }

    private void updateMessage(MessageEvent event, Map<Long, List<Long>> groupMemberIdsCache) {
        if (event == null || event.getEventType() != MessageEventType.MESSAGE) {
            return;
        }

        String conversationId = resolveConversationId(event);
        if (!StringUtils.hasText(conversationId)) {
            log.debug("Skip conversation cache update without conversationId. messageId={}", event.getMessageId());
            return;
        }

        MessageDTO lastMessage = resolveLastMessage(event);
        writeLastMessage(conversationId, lastMessage);

        if (event.getGroupId() != null || Boolean.TRUE.equals(event.getGroup())) {
            updateGroupConversationCaches(event, conversationId, groupMemberIdsCache);
            return;
        }
        updatePrivateConversationCaches(event, conversationId);
    }

    private void updatePrivateConversationCaches(MessageEvent event, String conversationId) {
        Long senderId = event.getSenderId();
        Long receiverId = event.getReceiverId();
        LocalDateTime timestamp = resolveTimestamp(event);

        if (senderId != null) {
            touchConversationIndex(senderId, conversationId, timestamp);
            initializeUnreadCount(senderId, conversationId);
        }
        if (receiverId != null) {
            touchConversationIndex(receiverId, conversationId, timestamp);
            if (!receiverId.equals(senderId)) {
                incrementUnreadCount(receiverId, conversationId, 1L);
            }
        }
    }

    private void updateGroupConversationCaches(MessageEvent event,
                                               String conversationId,
                                               Map<Long, List<Long>> groupMemberIdsCache) {
        Long groupId = event.getGroupId();
        Long senderId = event.getSenderId();
        LocalDateTime timestamp = resolveTimestamp(event);

        if (groupId == null) {
            if (senderId != null) {
                touchConversationIndex(senderId, conversationId, timestamp);
                initializeUnreadCount(senderId, conversationId);
            }
            return;
        }

        List<Long> memberIds = groupMemberIdsCache.computeIfAbsent(groupId, userProfileCache::getGroupMemberIds);
        if (memberIds == null || memberIds.isEmpty()) {
            if (senderId != null) {
                touchConversationIndex(senderId, conversationId, timestamp);
                initializeUnreadCount(senderId, conversationId);
            }
            return;
        }

        for (Long memberId : memberIds) {
            if (memberId == null) {
                continue;
            }
            touchConversationIndex(memberId, conversationId, timestamp);
            if (memberId.equals(senderId)) {
                initializeUnreadCount(memberId, conversationId);
            } else {
                incrementUnreadCount(memberId, conversationId, 1L);
            }
        }
    }

    private void writeLastMessage(String conversationId, MessageDTO lastMessage) {
        String lastMessageKey = lastMessageKeyPrefix + conversationId;
        try {
            redisTemplate.opsForHash().put(lastMessageKey, LAST_MESSAGE_FIELD, lastMessage);
            redisTemplate.expire(lastMessageKey, Duration.ofSeconds(resolveCacheTtlSeconds()));
        } catch (Exception exception) {
            log.warn("Write conversation last message cache failed. conversationId={}, error={}",
                    conversationId, exception.getMessage(), exception);
        }
    }

    private void touchConversationIndex(Long userId, String conversationId, LocalDateTime timestamp) {
        if (userId == null || !StringUtils.hasText(conversationId)) {
            return;
        }
        String indexKey = userIndexKeyPrefix + userId;
        double score = toScore(timestamp);
        try {
            redisTemplate.opsForZSet().add(indexKey, conversationId, score);
            redisTemplate.expire(indexKey, Duration.ofSeconds(resolveCacheTtlSeconds()));
        } catch (Exception exception) {
            log.warn("Update conversation index cache failed. userId={}, conversationId={}, error={}",
                    userId, conversationId, exception.getMessage(), exception);
        }
    }

    private void initializeUnreadCount(Long userId, String conversationId) {
        executeUnreadMutation(userId, conversationId, connection ->
                connection.hashCommands().hSetNX(
                        serializeKey(userUnreadKeyPrefix + userId),
                        serializeHashKey(conversationId),
                        ZERO_BYTES
                )
        );
    }

    private void incrementUnreadCount(Long userId, String conversationId, long delta) {
        executeUnreadMutation(userId, conversationId, connection ->
                connection.hashCommands().hIncrBy(
                        serializeKey(userUnreadKeyPrefix + userId),
                        serializeHashKey(conversationId),
                        delta
                )
        );
    }

    private void setUnreadCount(Long userId, String conversationId, long value) {
        executeUnreadMutation(userId, conversationId, connection ->
                connection.hashCommands().hSet(
                        serializeKey(userUnreadKeyPrefix + userId),
                        serializeHashKey(conversationId),
                        Long.toString(Math.max(0L, value)).getBytes(StandardCharsets.UTF_8)
                )
        );
    }

    private void executeUnreadMutation(Long userId, String conversationId, RedisMutation mutation) {
        if (userId == null || !StringUtils.hasText(conversationId)) {
            return;
        }

        String unreadKey = userUnreadKeyPrefix + userId;
        try {
            redisTemplate.execute((RedisCallback<Void>) connection -> {
                mutation.apply(connection);
                connection.expire(serializeKey(unreadKey), resolveCacheTtlSeconds());
                return null;
            });
        } catch (Exception exception) {
            log.warn("Update unread conversation cache failed. userId={}, conversationId={}, error={}",
                    userId, conversationId, exception.getMessage(), exception);
        }
    }

    private MessageDTO resolveLastMessage(MessageEvent event) {
        MessageDTO payload = event.getPayload();
        boolean groupMessage = event.getGroupId() != null || Boolean.TRUE.equals(event.getGroup());
        if (payload != null) {
            if (payload.getId() == null) {
                payload.setId(event.getMessageId());
            }
            if (!StringUtils.hasText(payload.getClientMessageId())) {
                payload.setClientMessageId(StringUtils.hasText(event.getClientMessageId())
                        ? event.getClientMessageId()
                        : event.getClientMsgId());
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
            if (payload.getCreatedTime() == null) {
                payload.setCreatedTime(resolveTimestamp(event));
            }
            if (payload.getCreatedAt() == null) {
                payload.setCreatedAt(payload.getCreatedTime());
            }
            if (payload.getUpdatedTime() == null) {
                payload.setUpdatedTime(event.getUpdatedTime());
            }
            if (payload.getUpdatedAt() == null) {
                payload.setUpdatedAt(payload.getUpdatedTime());
            }
            payload.setGroup(groupMessage);
            return payload;
        }

        LocalDateTime timestamp = resolveTimestamp(event);
        return MessageDTO.builder()
                .id(event.getMessageId())
                .clientMessageId(StringUtils.hasText(event.getClientMessageId())
                        ? event.getClientMessageId()
                        : event.getClientMsgId())
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
                .status(event.getStatusText())
                .createdTime(timestamp)
                .createdAt(timestamp)
                .updatedTime(event.getUpdatedTime())
                .updatedAt(event.getUpdatedTime())
                .isGroup(groupMessage)
                .build();
    }

    private String resolveConversationId(MessageEvent event) {
        if (StringUtils.hasText(event.getConversationId())) {
            return event.getConversationId().trim();
        }
        if (event.getGroupId() != null || Boolean.TRUE.equals(event.getGroup())) {
            return event.getGroupId() == null ? null : "g_" + event.getGroupId();
        }
        if (event.getSenderId() == null || event.getReceiverId() == null) {
            return null;
        }
        long min = Math.min(event.getSenderId(), event.getReceiverId());
        long max = Math.max(event.getSenderId(), event.getReceiverId());
        return "p_" + min + "_" + max;
    }

    private LocalDateTime resolveTimestamp(MessageEvent event) {
        if (event.getTimestamp() != null) {
            return event.getTimestamp();
        }
        if (event.getCreatedTime() != null) {
            return event.getCreatedTime();
        }
        if (event.getUpdatedTime() != null) {
            return event.getUpdatedTime();
        }
        return LocalDateTime.now();
    }

    private String resolveConversationId(StatusChangeEvent event) {
        if (StringUtils.hasText(event.getConversationId())) {
            return event.getConversationId().trim();
        }
        if (event.getGroupId() != null || Boolean.TRUE.equals(event.getGroup())) {
            return event.getGroupId() == null ? null : "g_" + event.getGroupId();
        }
        if (event.getSenderId() == null || event.getReceiverId() == null) {
            return null;
        }
        long min = Math.min(event.getSenderId(), event.getReceiverId());
        long max = Math.max(event.getSenderId(), event.getReceiverId());
        return "p_" + min + "_" + max;
    }

    private double toScore(LocalDateTime timestamp) {
        LocalDateTime safeTimestamp = timestamp == null ? LocalDateTime.now() : timestamp;
        return safeTimestamp.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private long resolveCacheTtlSeconds() {
        return Math.max(60L, cacheTtlSeconds);
    }

    private void clearLegacyConversationListCache(Long userId) {
        if (userId == null) {
            return;
        }
        try {
            redisTemplate.delete(legacyConversationListKeyPrefix + userId);
        } catch (Exception exception) {
            log.warn("Clear legacy conversation list cache failed. userId={}, error={}",
                    userId, exception.getMessage(), exception);
        }
    }

    @SuppressWarnings("unchecked")
    private byte[] serializeKey(String key) {
        RedisSerializer<Object> serializer = (RedisSerializer<Object>) redisTemplate.getKeySerializer();
        if (serializer == null) {
            return key.getBytes(StandardCharsets.UTF_8);
        }
        return serializer.serialize(key);
    }

    @SuppressWarnings("unchecked")
    private byte[] serializeHashKey(String key) {
        RedisSerializer<Object> serializer = (RedisSerializer<Object>) redisTemplate.getHashKeySerializer();
        if (serializer == null) {
            return key.getBytes(StandardCharsets.UTF_8);
        }
        return serializer.serialize(key);
    }

    @FunctionalInterface
    private interface RedisMutation {
        void apply(RedisConnection connection);
    }
}
