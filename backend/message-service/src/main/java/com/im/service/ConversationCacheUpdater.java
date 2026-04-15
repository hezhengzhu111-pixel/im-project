package com.im.service;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
import com.im.enums.MessageEventType;
import com.im.service.support.HotMessageRedisRepository;
import com.im.service.support.UserProfileCache;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ConversationCacheUpdater {

    private static final String LAST_MESSAGE_FIELD = "message";
    private static final byte[] ZERO_BYTES = "0".getBytes(StandardCharsets.UTF_8);
    private static final RedisScript<Long> IDEMPOTENT_UNREAD_INCREMENT_SCRIPT = new DefaultRedisScript<>(
            """
                    local markerKey = KEYS[1]
                    local unreadKey = KEYS[2]
                    local field = ARGV[1]
                    local unreadTtl = tonumber(ARGV[2])
                    local markerTtl = tonumber(ARGV[3])
                    local delta = tonumber(ARGV[4])
                    if redis.call('EXISTS', markerKey) == 1 then
                      redis.call('EXPIRE', markerKey, markerTtl)
                      redis.call('EXPIRE', unreadKey, unreadTtl)
                      return 0
                    end
                    redis.call('HINCRBY', unreadKey, field, delta)
                    redis.call('EXPIRE', unreadKey, unreadTtl)
                    redis.call('SET', markerKey, '1', 'EX', markerTtl)
                    return 1
                    """,
            Long.class
    );

    private final RedisTemplate<String, Object> redisTemplate;
    private final UserProfileCache userProfileCache;
    private final HotMessageRedisRepository hotMessageRedisRepository;

    @Value("${im.message.conversation-cache.last-message-key-prefix:last_message:}")
    private String lastMessageKeyPrefix;

    @Value("${im.message.conversation-cache.user-index-key-prefix:conversation:index:user:}")
    private String userIndexKeyPrefix;

    @Value("${im.message.conversation-cache.user-unread-key-prefix:conversation:unread:user:}")
    private String userUnreadKeyPrefix;

    @Value("${im.message.conversation-cache.legacy-list-key-prefix:conversations:user:}")
    private String legacyConversationListKeyPrefix;

    @Value("${im.message.conversation-cache.unread-applied-key-prefix:conversation:unread:applied:}")
    private String unreadAppliedKeyPrefix;

    @Value("${im.message.conversation-cache.ttl-seconds:3600}")
    private long cacheTtlSeconds;

    @Value("${im.message.conversation-cache.unread-applied-ttl-seconds:86400}")
    private long unreadAppliedTtlSeconds;

    public void applyFirstSeenAcceptedMessage(MessageEvent event) {
        if (event == null || event.getEventType() != MessageEventType.MESSAGE || event.getMessageId() == null) {
            throw new IllegalArgumentException("accepted message event is invalid");
        }

        String conversationId = resolveConversationId(event);
        if (!StringUtils.hasText(conversationId)) {
            throw new IllegalArgumentException("conversationId cannot be blank");
        }

        MessageDTO lastMessage = resolveLastMessage(event);
        LocalDateTime timestamp = resolveTimestamp(event);
        hotMessageRedisRepository.addRecentMessage(conversationId, event.getMessageId(), timestamp);
        writeLastMessage(conversationId, lastMessage);

        if (event.getGroupId() != null || Boolean.TRUE.equals(event.getGroup())) {
            applyFirstSeenGroupConversationCaches(event, conversationId, timestamp);
            return;
        }
        applyFirstSeenPrivateConversationCaches(event, conversationId, timestamp);
    }

    public void rehydrateAcceptedMessage(MessageDTO message) {
        MessageDTO normalizedMessage = normalizeAcceptedMessage(message);
        String conversationId = resolveConversationId(normalizedMessage);
        if (!StringUtils.hasText(conversationId)) {
            throw new IllegalArgumentException("conversationId cannot be blank");
        }

        LocalDateTime timestamp = resolveTimestamp(normalizedMessage);
        writeLastMessage(conversationId, normalizedMessage);

        if (isGroupMessage(normalizedMessage)) {
            rehydrateGroupConversationCaches(normalizedMessage, conversationId, timestamp);
            return;
        }
        rehydratePrivateConversationCaches(normalizedMessage, conversationId, timestamp);
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
        MessageDTO payload = event.getPayload();
        if (payload != null) {
            hotMessageRedisRepository.saveHotMessage(payload);
        }
        if (!StringUtils.hasText(conversationId) || payload == null) {
            clearLegacyStatusCaches(event);
            return;
        }

        String lastMessageKey = lastMessageKeyPrefix + conversationId;
        Object cachedValue = redisTemplate.opsForHash().get(lastMessageKey, LAST_MESSAGE_FIELD);
        if (cachedValue instanceof MessageDTO cachedMessage
                && cachedMessage.getId() != null
                && cachedMessage.getId().equals(event.getMessageId())) {
            redisTemplate.opsForHash().put(lastMessageKey, LAST_MESSAGE_FIELD, payload);
            redisTemplate.expire(lastMessageKey, Duration.ofSeconds(resolveCacheTtlSeconds()));
        }
        clearLegacyStatusCaches(event);
    }

    private void applyFirstSeenPrivateConversationCaches(MessageEvent event,
                                                         String conversationId,
                                                         LocalDateTime timestamp) {
        Long senderId = event.getSenderId();
        Long receiverId = event.getReceiverId();
        if (senderId != null) {
            touchConversationIndex(senderId, conversationId, timestamp);
            initializeUnreadCount(senderId, conversationId);
        }
        if (receiverId != null) {
            touchConversationIndex(receiverId, conversationId, timestamp);
            if (!receiverId.equals(senderId)) {
                incrementUnreadCountOnce(receiverId, conversationId, event.getMessageId(), 1L);
            }
        }
        clearLegacyConversationListCache(senderId);
        clearLegacyConversationListCache(receiverId);
    }

    private void applyFirstSeenGroupConversationCaches(MessageEvent event,
                                                       String conversationId,
                                                       LocalDateTime timestamp) {
        Long groupId = event.getGroupId();
        Long senderId = event.getSenderId();
        List<Long> memberIds = groupId == null ? List.of() : userProfileCache.getGroupMemberIds(groupId);
        if (memberIds == null || memberIds.isEmpty()) {
            memberIds = senderId == null ? List.of() : List.of(senderId);
        }

        for (Long memberId : memberIds) {
            if (memberId == null) {
                continue;
            }
            touchConversationIndex(memberId, conversationId, timestamp);
            if (memberId.equals(senderId)) {
                initializeUnreadCount(memberId, conversationId);
            } else {
                incrementUnreadCountOnce(memberId, conversationId, event.getMessageId(), 1L);
            }
            clearLegacyConversationListCache(memberId);
        }
    }

    private void rehydratePrivateConversationCaches(MessageDTO message,
                                                    String conversationId,
                                                    LocalDateTime timestamp) {
        touchConversationIndex(message.getSenderId(), conversationId, timestamp);
        touchConversationIndex(message.getReceiverId(), conversationId, timestamp);
        clearLegacyConversationListCache(message.getSenderId());
        clearLegacyConversationListCache(message.getReceiverId());
    }

    private void rehydrateGroupConversationCaches(MessageDTO message,
                                                  String conversationId,
                                                  LocalDateTime timestamp) {
        Long groupId = message.getGroupId();
        Long senderId = message.getSenderId();
        List<Long> memberIds = groupId == null ? List.of() : userProfileCache.getGroupMemberIds(groupId);
        if (memberIds == null || memberIds.isEmpty()) {
            memberIds = senderId == null ? List.of() : List.of(senderId);
        }

        for (Long memberId : memberIds) {
            if (memberId == null) {
                continue;
            }
            touchConversationIndex(memberId, conversationId, timestamp);
            clearLegacyConversationListCache(memberId);
        }
    }

    private void writeLastMessage(String conversationId, MessageDTO lastMessage) {
        String key = lastMessageKeyPrefix + conversationId;
        Object currentValue = redisTemplate.opsForHash().get(key, LAST_MESSAGE_FIELD);
        if (currentValue instanceof MessageDTO currentMessage && !shouldReplaceLastMessage(currentMessage, lastMessage)) {
            redisTemplate.expire(key, Duration.ofSeconds(resolveCacheTtlSeconds()));
            return;
        }
        redisTemplate.opsForHash().put(key, LAST_MESSAGE_FIELD, lastMessage);
        redisTemplate.expire(key, Duration.ofSeconds(resolveCacheTtlSeconds()));
    }

    private boolean shouldReplaceLastMessage(MessageDTO currentMessage, MessageDTO nextMessage) {
        if (nextMessage == null) {
            return false;
        }
        if (currentMessage == null || currentMessage.getId() == null) {
            return true;
        }
        if (nextMessage.getId() == null) {
            return false;
        }
        LocalDateTime currentTime = currentMessage.getCreatedTime();
        LocalDateTime nextTime = nextMessage.getCreatedTime();
        if (currentTime == null || nextTime == null) {
            return nextMessage.getId() >= currentMessage.getId();
        }
        if (nextTime.isAfter(currentTime)) {
            return true;
        }
        if (nextTime.isBefore(currentTime)) {
            return false;
        }
        return nextMessage.getId() >= currentMessage.getId();
    }

    private void touchConversationIndex(Long userId, String conversationId, LocalDateTime timestamp) {
        if (userId == null || !StringUtils.hasText(conversationId)) {
            return;
        }
        String indexKey = userIndexKeyPrefix + userId;
        redisTemplate.opsForZSet().add(indexKey, conversationId, toScore(timestamp));
        redisTemplate.expire(indexKey, Duration.ofSeconds(resolveCacheTtlSeconds()));
    }

    private void initializeUnreadCount(Long userId, String conversationId) {
        executeUnreadMutation(userId, conversationId, connection -> {
            connection.hashCommands().hSetNX(
                    serializeKey(userUnreadKeyPrefix + userId),
                    serializeHashKey(conversationId),
                    ZERO_BYTES
            );
            return null;
        });
    }

    private void incrementUnreadCountOnce(Long userId, String conversationId, Long messageId, long delta) {
        if (userId == null || !StringUtils.hasText(conversationId) || messageId == null || delta == 0L) {
            return;
        }
        redisTemplate.execute(
                IDEMPOTENT_UNREAD_INCREMENT_SCRIPT,
                List.of(buildUnreadAppliedKey(userId, conversationId, messageId), userUnreadKeyPrefix + userId),
                conversationId.trim(),
                Long.toString(resolveCacheTtlSeconds()),
                Long.toString(resolveUnreadAppliedTtlSeconds()),
                Long.toString(delta)
        );
    }

    private void setUnreadCount(Long userId, String conversationId, long value) {
        executeUnreadMutation(userId, conversationId, connection -> {
            connection.hashCommands().hSet(
                    serializeKey(userUnreadKeyPrefix + userId),
                    serializeHashKey(conversationId),
                    Long.toString(Math.max(0L, value)).getBytes(StandardCharsets.UTF_8)
            );
            return null;
        });
    }

    private void executeUnreadMutation(Long userId, String conversationId, RedisMutation mutation) {
        if (userId == null || !StringUtils.hasText(conversationId)) {
            return;
        }
        String unreadKey = userUnreadKeyPrefix + userId;
        redisTemplate.execute((RedisCallback<Void>) connection -> {
            mutation.apply(connection);
            connection.expire(serializeKey(unreadKey), resolveCacheTtlSeconds());
            return null;
        });
    }

    private MessageDTO resolveLastMessage(MessageEvent event) {
        MessageDTO payload = event.getPayload();
        boolean groupMessage = event.getGroupId() != null || Boolean.TRUE.equals(event.getGroup());
        if (payload != null) {
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
                .status(event.getStatusText())
                .replyToMessageId(event.getReplyToMessageId())
                .createdTime(timestamp)
                .createdAt(timestamp)
                .updatedTime(event.getUpdatedTime())
                .updatedAt(event.getUpdatedTime())
                .isGroup(groupMessage)
                .build();
    }

    private MessageDTO normalizeAcceptedMessage(MessageDTO message) {
        if (message == null || message.getId() == null) {
            throw new IllegalArgumentException("accepted message cannot be null");
        }
        if (StringUtils.hasText(message.getClientMessageId())) {
            message.setClientMessageId(message.getClientMessageId().trim());
        }
        boolean groupMessage = isGroupMessage(message);
        if (message.getCreatedTime() == null) {
            message.setCreatedTime(resolveTimestamp(message));
        }
        if (message.getCreatedAt() == null) {
            message.setCreatedAt(message.getCreatedTime());
        }
        if (message.getUpdatedAt() == null) {
            message.setUpdatedAt(message.getUpdatedTime());
        }
        message.setGroup(groupMessage);
        return message;
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

    private String resolveConversationId(MessageDTO message) {
        if (message == null) {
            return null;
        }
        if (isGroupMessage(message)) {
            return message.getGroupId() == null ? null : "g_" + message.getGroupId();
        }
        if (message.getSenderId() == null || message.getReceiverId() == null) {
            return null;
        }
        long min = Math.min(message.getSenderId(), message.getReceiverId());
        long max = Math.max(message.getSenderId(), message.getReceiverId());
        return "p_" + min + "_" + max;
    }

    private LocalDateTime resolveTimestamp(MessageDTO message) {
        if (message == null) {
            return LocalDateTime.now();
        }
        if (message.getCreatedTime() != null) {
            return message.getCreatedTime();
        }
        if (message.getCreatedAt() != null) {
            return message.getCreatedAt();
        }
        if (message.getUpdatedTime() != null) {
            return message.getUpdatedTime();
        }
        if (message.getUpdatedAt() != null) {
            return message.getUpdatedAt();
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

    private void clearLegacyStatusCaches(StatusChangeEvent event) {
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
        clearLegacyConversationListCache(event.getSenderId());
        clearLegacyConversationListCache(event.getReceiverId());
    }

    private String firstText(String primary, String fallback) {
        if (StringUtils.hasText(primary)) {
            return primary.trim();
        }
        if (StringUtils.hasText(fallback)) {
            return fallback.trim();
        }
        return null;
    }

    private boolean isGroupMessage(MessageDTO message) {
        return message != null
                && (message.isGroup()
                || Boolean.TRUE.equals(message.getIsGroupChat())
                || Boolean.TRUE.equals(message.getIsGroupMessage())
                || message.getGroupId() != null);
    }

    private double toScore(LocalDateTime timestamp) {
        LocalDateTime safeTimestamp = timestamp == null ? LocalDateTime.now() : timestamp;
        return safeTimestamp.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private long resolveCacheTtlSeconds() {
        return Math.max(60L, cacheTtlSeconds);
    }

    private long resolveUnreadAppliedTtlSeconds() {
        return Math.max(resolveCacheTtlSeconds(), unreadAppliedTtlSeconds);
    }

    private String buildUnreadAppliedKey(Long userId, String conversationId, Long messageId) {
        return unreadAppliedKeyPrefix + userId + ":" + conversationId.trim() + ":" + messageId;
    }

    private void clearLegacyConversationListCache(Long userId) {
        if (userId == null) {
            return;
        }
        redisTemplate.delete(legacyConversationListKeyPrefix + userId);
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
        Object apply(RedisConnection connection);
    }
}
