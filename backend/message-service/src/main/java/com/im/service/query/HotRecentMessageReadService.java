package com.im.service.query;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.im.dto.MessageDTO;
import com.im.dto.UserDTO;
import com.im.enums.MessageType;
import com.im.mapper.MessageMapper;
import com.im.message.entity.Message;
import com.im.metrics.MessageServiceMetrics;
import com.im.service.support.HotMessageRedisRepository;
import com.im.service.support.PersistenceWatermarkService;
import com.im.service.support.UserProfileCache;
import com.im.util.MessageConverter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class HotRecentMessageReadService {

    private static final int HOT_RECENT_SCAN_LIMIT = 500;

    private final HotMessageRedisRepository hotMessageRedisRepository;
    private final MessageMapper messageMapper;
    private final PersistenceWatermarkService persistenceWatermarkService;
    private final UserProfileCache userProfileCache;

    @Autowired(required = false)
    private MessageServiceMetrics metrics;

    @Value("${im.message.system.sender-id:0}")
    private Long defaultSystemSenderId;

    public List<MessageDTO> loadLatestMessages(String conversationId, int limit) {
        int realLimit = Math.max(1, limit);
        List<MessageDTO> hotMessages = filterVisibleMessages(
                hotMessageRedisRepository.getRecentMessages(conversationId, Math.max(realLimit, HOT_RECENT_SCAN_LIMIT))
        );
        if (hotMessages.size() >= realLimit) {
            return mergeHotAndPersisted(hotMessages, List.of(), false, realLimit);
        }
        Long watermark = resolveWatermark(conversationId);
        List<MessageDTO> persistedMessages = loadPersistedLatestMessages(
                conversationId,
                watermark,
                realLimit + hotMessages.size()
        );
        return mergeHotAndPersisted(hotMessages, persistedMessages, false, realLimit);
    }

    public List<MessageDTO> loadCursorMessages(String conversationId,
                                               Long lastMessageId,
                                               LocalDateTime beforeTimestamp,
                                               Long afterMessageId,
                                               int limit) {
        int realLimit = Math.max(1, limit);
        boolean ascending = afterMessageId != null;
        List<MessageDTO> hotMessages = filterCursorMessages(
                hotMessageRedisRepository.getRecentMessages(conversationId, HOT_RECENT_SCAN_LIMIT),
                lastMessageId,
                beforeTimestamp,
                afterMessageId
        );
        Long watermark = resolveWatermark(conversationId);
        if (watermark != null && afterMessageId != null && afterMessageId >= watermark) {
            return mergeHotAndPersisted(hotMessages, List.of(), ascending, realLimit);
        }
        List<MessageDTO> persistedMessages = loadPersistedCursorMessages(
                conversationId,
                watermark,
                lastMessageId,
                beforeTimestamp,
                afterMessageId,
                realLimit + hotMessages.size()
        );
        return mergeHotAndPersisted(hotMessages, persistedMessages, ascending, realLimit);
    }

    public List<MessageDTO> mergeHotAndPersisted(List<MessageDTO> hotMessages,
                                                 List<MessageDTO> persistedMessages,
                                                 boolean ascending,
                                                 int limit) {
        Map<Long, MessageDTO> merged = new LinkedHashMap<>();
        for (MessageDTO hotMessage : filterVisibleMessages(hotMessages)) {
            if (hotMessage.getId() != null) {
                merged.put(hotMessage.getId(), hotMessage);
            }
        }
        for (MessageDTO persistedMessage : filterVisibleMessages(persistedMessages)) {
            if (persistedMessage.getId() != null) {
                merged.putIfAbsent(persistedMessage.getId(), persistedMessage);
            }
        }

        List<MessageDTO> messages = new ArrayList<>(merged.values());
        messages.sort(messageComparator(ascending));
        if (messages.size() <= limit) {
            return messages;
        }
        return messages.subList(0, limit);
    }

    public Long resolveLatestVisibleMessageId(String conversationId) {
        for (MessageDTO hotMessage : hotMessageRedisRepository.getRecentMessages(conversationId, HOT_RECENT_SCAN_LIMIT)) {
            if (isVisibleMessage(hotMessage) && hotMessage.getId() != null) {
                return hotMessage.getId();
            }
        }

        Long watermark = resolveWatermark(conversationId);
        Message latestVisible = selectLatestVisiblePersistedMessage(conversationId, watermark);
        return latestVisible == null ? null : latestVisible.getId();
    }

    private List<MessageDTO> loadPersistedLatestMessages(String conversationId, Long watermark, int limit) {
        ConversationScope scope = parseConversationScope(conversationId);
        if (scope == null || limit <= 0) {
            return List.of();
        }

        LambdaQueryWrapper<Message> wrapper = buildVisibleConversationWrapper(scope, watermark)
                .orderByDesc(Message::getId)
                .last("limit " + limit);
        recordWatermarkDbFallbackHit();
        return toMessageDTOs(messageMapper.selectList(wrapper));
    }

    private List<MessageDTO> loadPersistedCursorMessages(String conversationId,
                                                         Long watermark,
                                                         Long lastMessageId,
                                                         LocalDateTime beforeTimestamp,
                                                         Long afterMessageId,
                                                         int limit) {
        ConversationScope scope = parseConversationScope(conversationId);
        if (scope == null || limit <= 0) {
            return List.of();
        }

        LambdaQueryWrapper<Message> wrapper = buildVisibleConversationWrapper(scope, watermark);

        if (afterMessageId != null) {
            wrapper.gt(Message::getId, afterMessageId)
                    .orderByAsc(Message::getId)
                    .last("limit " + limit);
        } else {
            if (lastMessageId != null) {
                wrapper.lt(Message::getId, lastMessageId);
            } else if (beforeTimestamp != null) {
                wrapper.lt(Message::getCreatedTime, beforeTimestamp);
            }
            wrapper.orderByDesc(Message::getId)
                    .last("limit " + limit);
        }

        recordWatermarkDbFallbackHit();
        return toMessageDTOs(messageMapper.selectList(wrapper));
    }

    private LambdaQueryWrapper<Message> buildConversationWrapper(ConversationScope scope) {
        LambdaQueryWrapper<Message> wrapper = new LambdaQueryWrapper<>();
        if (scope.group()) {
            return wrapper.eq(Message::getGroupId, scope.groupId())
                    .eq(Message::getIsGroupChat, true);
        }
        return wrapper.eq(Message::getIsGroupChat, false)
                .and(w -> w.eq(Message::getSenderId, scope.leftUserId()).eq(Message::getReceiverId, scope.rightUserId())
                        .or()
                        .eq(Message::getSenderId, scope.rightUserId()).eq(Message::getReceiverId, scope.leftUserId()));
    }

    private LambdaQueryWrapper<Message> buildVisibleConversationWrapper(ConversationScope scope, Long watermark) {
        LambdaQueryWrapper<Message> wrapper = buildConversationWrapper(scope)
                .ne(Message::getStatus, Message.MessageStatus.DELETED);
        if (watermark != null) {
            wrapper.le(Message::getId, watermark);
        }
        return wrapper;
    }

    private List<MessageDTO> filterCursorMessages(List<MessageDTO> messages,
                                                  Long lastMessageId,
                                                  LocalDateTime beforeTimestamp,
                                                  Long afterMessageId) {
        return filterVisibleMessages(messages).stream()
                .filter(message -> matchesCursorRequest(message, lastMessageId, beforeTimestamp, afterMessageId))
                .toList();
    }

    private List<MessageDTO> filterVisibleMessages(List<MessageDTO> messages) {
        if (messages == null || messages.isEmpty()) {
            return List.of();
        }
        return messages.stream()
                .filter(this::isVisibleMessage)
                .filter(message -> message.getId() != null)
                .toList();
    }

    private boolean matchesCursorRequest(MessageDTO message,
                                         Long lastMessageId,
                                         LocalDateTime beforeTimestamp,
                                         Long afterMessageId) {
        if (message == null || message.getId() == null) {
            return false;
        }
        if (afterMessageId != null) {
            return message.getId() > afterMessageId;
        }
        if (lastMessageId != null) {
            return message.getId() < lastMessageId;
        }
        if (beforeTimestamp == null) {
            return true;
        }
        LocalDateTime messageTime = resolveMessageTime(message);
        return messageTime == null || messageTime.isBefore(beforeTimestamp);
    }

    private Long resolveWatermark(String conversationId) {
        if (!StringUtils.hasText(conversationId)) {
            return null;
        }
        return persistenceWatermarkService.getPersistedWatermark(conversationId.trim());
    }

    private boolean isVisibleMessage(MessageDTO message) {
        return message != null && !isDeletedMessage(message);
    }

    private boolean isDeletedMessage(MessageDTO message) {
        if (message == null || !StringUtils.hasText(message.getStatus())) {
            return false;
        }
        String normalizedStatus = message.getStatus().trim();
        return "5".equals(normalizedStatus) || "DELETED".equalsIgnoreCase(normalizedStatus);
    }

    private Comparator<MessageDTO> messageComparator(boolean ascending) {
        Comparator<MessageDTO> comparator = Comparator.comparing(MessageDTO::getId, Comparator.nullsLast(Long::compareTo));
        return ascending ? comparator : comparator.reversed();
    }

    private Message selectLatestVisiblePersistedMessage(String conversationId, Long watermark) {
        ConversationScope scope = parseConversationScope(conversationId);
        if (scope == null) {
            return null;
        }
        LambdaQueryWrapper<Message> wrapper = buildVisibleConversationWrapper(scope, watermark)
                .orderByDesc(Message::getId)
                .last("limit 1");
        recordWatermarkDbFallbackHit();
        return messageMapper.selectOne(wrapper);
    }

    private void recordWatermarkDbFallbackHit() {
        if (metrics != null) {
            metrics.recordWatermarkDbFallbackHit();
        }
    }

    private ConversationScope parseConversationScope(String conversationId) {
        if (!StringUtils.hasText(conversationId)) {
            return null;
        }
        String normalizedConversationId = conversationId.trim();
        if (normalizedConversationId.startsWith("g_")) {
            return new ConversationScope(true, null, null, Long.valueOf(normalizedConversationId.substring(2)));
        }
        if (!normalizedConversationId.startsWith("p_")) {
            return null;
        }
        String[] parts = normalizedConversationId.split("_");
        if (parts.length != 3) {
            return null;
        }
        return new ConversationScope(false, Long.valueOf(parts[1]), Long.valueOf(parts[2]), null);
    }

    private List<MessageDTO> toMessageDTOs(List<Message> messages) {
        if (messages == null || messages.isEmpty()) {
            return List.of();
        }
        List<MessageDTO> results = new ArrayList<>(messages.size());
        for (Message message : messages) {
            MessageDTO dto = toMessageDTO(message);
            if (dto != null) {
                results.add(dto);
            }
        }
        return results;
    }

    private MessageDTO toMessageDTO(Message message) {
        if (message == null) {
            return null;
        }
        boolean groupMessage = Boolean.TRUE.equals(message.getIsGroupChat());
        UserDTO sender = message.getSenderId() == null ? null : userProfileCache.getUser(message.getSenderId());
        UserDTO receiver = !groupMessage && message.getReceiverId() != null ? userProfileCache.getUser(message.getReceiverId()) : null;
        MessageDTO dto = MessageConverter.convertToDTO(
                message,
                resolveSenderName(message, sender),
                sender == null ? null : sender.getAvatar(),
                receiver == null ? null : receiver.getUsername(),
                receiver == null ? null : receiver.getAvatar(),
                null
        );
        if (dto != null) {
            dto.setGroup(groupMessage);
        }
        return dto;
    }

    private String resolveSenderName(Message message, UserDTO sender) {
        if (sender != null) {
            return sender.getUsername();
        }
        if (message != null
                && message.getMessageType() == MessageType.SYSTEM
                && Objects.equals(message.getSenderId(), defaultSystemSenderId)) {
            return "SYSTEM";
        }
        return null;
    }

    private LocalDateTime resolveMessageTime(MessageDTO message) {
        if (message == null) {
            return null;
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
        return message.getUpdatedAt();
    }

    private record ConversationScope(boolean group, Long leftUserId, Long rightUserId, Long groupId) {
    }
}
