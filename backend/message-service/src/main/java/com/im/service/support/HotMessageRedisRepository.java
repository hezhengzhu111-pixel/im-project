package com.im.service.support;

import com.im.dto.MessageDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class HotMessageRedisRepository {

    private static final RedisScript<Long> PERSISTED_WATERMARK_UPDATE_SCRIPT = new DefaultRedisScript<>(
            """
                    local current = redis.call('GET', KEYS[1])
                    local next = tonumber(ARGV[1])
                    local ttl = tonumber(ARGV[2])
                    if (not current) then
                      redis.call('SET', KEYS[1], tostring(next))
                      redis.call('EXPIRE', KEYS[1], ttl)
                      return next
                    end
                    current = tonumber(current)
                    if next > current then
                      current = next
                      redis.call('SET', KEYS[1], tostring(current))
                    end
                    redis.call('EXPIRE', KEYS[1], ttl)
                    return current
                    """,
            Long.class
    );

    private final RedisTemplate<String, Object> redisTemplate;

    @Value("${im.message.hot-message.key-prefix:message:hot:}")
    private String hotMessageKeyPrefix;

    @Value("${im.message.hot-message.ttl-seconds:3600}")
    private long hotMessageTtlSeconds;

    @Value("${im.message.client-message.key-prefix:message:client:}")
    private String clientMessageKeyPrefix;

    @Value("${im.message.conversation-recent.key-prefix:conversation:recent:}")
    private String conversationRecentKeyPrefix;

    @Value("${im.message.conversation-recent.max-size:500}")
    private long conversationRecentMaxSize;

    @Value("${im.message.pending-persist.key-prefix:conversation:pending:persist:}")
    private String pendingPersistKeyPrefix;

    @Value("${im.message.pending-persist.ttl-seconds:86400}")
    private long pendingPersistTtlSeconds;

    @Value("${im.message.persisted-watermark.key-prefix:conversation:persisted:watermark:}")
    private String persistedWatermarkKeyPrefix;

    @Value("${im.message.persisted-watermark.ttl-seconds:86400}")
    private long persistedWatermarkTtlSeconds;

    @Value("${im.message.conversation-cache.last-message-key-prefix:last_message:}")
    private String lastMessageKeyPrefix;

    @Value("${im.message.conversation-cache.user-index-key-prefix:conversation:index:user:}")
    private String userIndexKeyPrefix;

    @Value("${im.message.conversation-cache.user-unread-key-prefix:conversation:unread:user:}")
    private String userUnreadKeyPrefix;

    private static final String LAST_MESSAGE_FIELD = "message";

    public void saveHotMessage(MessageDTO message) {
        if (message == null || message.getId() == null) {
            return;
        }
        String key = hotMessageKeyPrefix + message.getId();
        redisTemplate.opsForValue().set(key, message, Duration.ofSeconds(resolveHotMessageTtlSeconds()));
    }

    public MessageDTO getHotMessage(Long messageId) {
        if (messageId == null) {
            return null;
        }
        Object value = redisTemplate.opsForValue().get(hotMessageKeyPrefix + messageId);
        if (value instanceof MessageDTO messageDTO) {
            return messageDTO;
        }
        return null;
    }

    public void saveClientMessageMapping(Long senderId, String clientMessageId, Long messageId) {
        if (senderId == null || messageId == null || !StringUtils.hasText(clientMessageId)) {
            return;
        }
        redisTemplate.opsForValue().set(
                buildClientMessageKey(senderId, clientMessageId),
                messageId,
                Duration.ofSeconds(resolveHotMessageTtlSeconds())
        );
    }

    public Long getMessageIdByClientMessageId(Long senderId, String clientMessageId) {
        if (senderId == null || !StringUtils.hasText(clientMessageId)) {
            return null;
        }
        Object value = redisTemplate.opsForValue().get(buildClientMessageKey(senderId, clientMessageId));
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            return Long.valueOf(text.trim());
        }
        return null;
    }

    public void addRecentMessage(String conversationId, Long messageId, LocalDateTime createdTime) {
        if (!StringUtils.hasText(conversationId) || messageId == null) {
            return;
        }
        String key = conversationRecentKeyPrefix + conversationId.trim();
        redisTemplate.opsForZSet().add(key, messageId, toEpochMilli(createdTime));
        Long size = redisTemplate.opsForZSet().zCard(key);
        long maxSize = resolveConversationRecentMaxSize();
        if (size != null && size > maxSize) {
            redisTemplate.opsForZSet().removeRange(key, 0, size - maxSize - 1);
        }
        redisTemplate.expire(key, Duration.ofSeconds(resolveHotMessageTtlSeconds()));
    }

    public List<MessageDTO> getRecentMessages(String conversationId, int limit) {
        if (!StringUtils.hasText(conversationId) || limit <= 0) {
            return List.of();
        }
        Set<Object> messageIds = redisTemplate.opsForZSet().reverseRange(
                conversationRecentKeyPrefix + conversationId.trim(),
                0,
                Math.max(0, limit - 1)
        );
        return loadMessagesByIds(messageIds);
    }

    public void addPendingPersistMessage(String conversationId, Long messageId, LocalDateTime acceptedTime) {
        if (!StringUtils.hasText(conversationId) || messageId == null) {
            return;
        }
        String key = pendingPersistKeyPrefix + conversationId.trim();
        redisTemplate.opsForZSet().add(key, messageId, toEpochMilli(acceptedTime));
        redisTemplate.expire(key, Duration.ofSeconds(resolvePendingPersistTtlSeconds()));
    }

    public boolean hasPendingPersistMessage(String conversationId, Long messageId) {
        if (!StringUtils.hasText(conversationId) || messageId == null) {
            return false;
        }
        Double score = redisTemplate.opsForZSet().score(pendingPersistKeyPrefix + conversationId.trim(), messageId);
        return score != null;
    }

    public void removePendingPersistMessage(String conversationId, Long messageId) {
        if (!StringUtils.hasText(conversationId) || messageId == null) {
            return;
        }
        redisTemplate.opsForZSet().remove(pendingPersistKeyPrefix + conversationId.trim(), messageId);
    }

    public List<Long> listPendingPersistMessageIds(String conversationId, int limit) {
        if (!StringUtils.hasText(conversationId) || limit <= 0) {
            return List.of();
        }
        Set<Object> values = redisTemplate.opsForZSet().range(
                pendingPersistKeyPrefix + conversationId.trim(),
                0,
                Math.max(0, limit - 1)
        );
        return toMessageIds(values);
    }

    public List<Long> listPendingPersistMessageIdsBefore(String conversationId, long scoreInclusiveUpperBound, int limit) {
        if (!StringUtils.hasText(conversationId) || limit <= 0) {
            return List.of();
        }
        Set<Object> values = redisTemplate.opsForZSet().rangeByScore(
                pendingPersistKeyPrefix + conversationId.trim(),
                Double.NEGATIVE_INFINITY,
                scoreInclusiveUpperBound,
                0,
                limit
        );
        return toMessageIds(values);
    }

    public List<String> listPendingPersistConversationIds() {
        Set<String> keys = redisTemplate.keys(pendingPersistKeyPrefix + "*");
        if (keys == null || keys.isEmpty()) {
            return List.of();
        }
        return keys.stream()
                .filter(StringUtils::hasText)
                .map(String::trim)
                .filter(key -> key.startsWith(pendingPersistKeyPrefix))
                .map(key -> key.substring(pendingPersistKeyPrefix.length()))
                .filter(StringUtils::hasText)
                .distinct()
                .toList();
    }

    public void savePersistedWatermark(String conversationId, Long messageId) {
        if (!StringUtils.hasText(conversationId) || messageId == null) {
            return;
        }
        redisTemplate.execute(
                PERSISTED_WATERMARK_UPDATE_SCRIPT,
                List.of(persistedWatermarkKeyPrefix + conversationId.trim()),
                Long.toString(messageId),
                Long.toString(resolvePersistedWatermarkTtlSeconds())
        );
    }

    public Long getPersistedWatermark(String conversationId) {
        if (!StringUtils.hasText(conversationId)) {
            return null;
        }
        Object value = redisTemplate.opsForValue().get(persistedWatermarkKeyPrefix + conversationId.trim());
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            return Long.valueOf(text.trim());
        }
        return null;
    }

    public List<String> getConversationIdsForUser(Long userId, int limit) {
        if (userId == null || limit <= 0) {
            return List.of();
        }
        Set<Object> values = redisTemplate.opsForZSet().reverseRange(
                userIndexKeyPrefix + userId,
                0,
                Math.max(0, limit - 1)
        );
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        return values.stream()
                .filter(Objects::nonNull)
                .map(Object::toString)
                .filter(StringUtils::hasText)
                .toList();
    }

    public MessageDTO getLastMessage(String conversationId) {
        if (!StringUtils.hasText(conversationId)) {
            return null;
        }
        Object value = redisTemplate.opsForHash().get(lastMessageKeyPrefix + conversationId.trim(), LAST_MESSAGE_FIELD);
        if (value instanceof MessageDTO messageDTO) {
            return messageDTO;
        }
        return null;
    }

    public long getUnreadCount(Long userId, String conversationId) {
        if (userId == null || !StringUtils.hasText(conversationId)) {
            return 0L;
        }
        Object value = redisTemplate.opsForHash().get(userUnreadKeyPrefix + userId, conversationId.trim());
        if (value instanceof Number number) {
            return Math.max(0L, number.longValue());
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            return Math.max(0L, Long.parseLong(text.trim()));
        }
        return 0L;
    }

    private List<MessageDTO> loadMessagesByIds(Set<Object> messageIds) {
        if (messageIds == null || messageIds.isEmpty()) {
            return List.of();
        }
        List<Object> orderedIds = new ArrayList<>(messageIds);
        List<String> keys = orderedIds.stream()
                .map(this::toMessageId)
                .filter(Objects::nonNull)
                .map(id -> hotMessageKeyPrefix + id)
                .collect(Collectors.toList());
        if (keys.isEmpty()) {
            return List.of();
        }
        List<Object> values = redisTemplate.opsForValue().multiGet(keys);
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        List<MessageDTO> messages = new ArrayList<>(values.size());
        for (Object value : values) {
            if (value instanceof MessageDTO messageDTO) {
                messages.add(messageDTO);
            }
        }
        return messages;
    }

    private List<Long> toMessageIds(Set<Object> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        List<Long> messageIds = new ArrayList<>(values.size());
        for (Object value : values) {
            Long messageId = toMessageId(value);
            if (messageId != null) {
                messageIds.add(messageId);
            }
        }
        return messageIds;
    }

    private Long toMessageId(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            return Long.valueOf(text.trim());
        }
        return null;
    }

    private String buildClientMessageKey(Long senderId, String clientMessageId) {
        return clientMessageKeyPrefix + senderId + ":" + clientMessageId.trim();
    }

    private long toEpochMilli(LocalDateTime time) {
        LocalDateTime safeTime = time == null ? LocalDateTime.now() : time;
        return safeTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private long resolveHotMessageTtlSeconds() {
        return Math.max(60L, hotMessageTtlSeconds);
    }

    private long resolvePendingPersistTtlSeconds() {
        return Math.max(resolveHotMessageTtlSeconds(), pendingPersistTtlSeconds);
    }

    private long resolvePersistedWatermarkTtlSeconds() {
        return Math.max(60L, persistedWatermarkTtlSeconds);
    }

    private long resolveConversationRecentMaxSize() {
        return Math.max(1L, conversationRecentMaxSize);
    }
}
