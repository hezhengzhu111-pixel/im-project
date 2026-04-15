package com.im.service.query;

import com.im.dto.MessageDTO;
import com.im.service.support.HotMessageRedisRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class HotConversationReadService {

    private final HotMessageRedisRepository hotMessageRedisRepository;

    public List<String> listConversationIds(Long userId, int limit) {
        return hotMessageRedisRepository.getConversationIdsForUser(userId, limit);
    }

    public MessageDTO getLastMessage(String conversationId) {
        return hotMessageRedisRepository.getLastMessage(conversationId);
    }

    public long getUnreadCount(Long userId, String conversationId) {
        return hotMessageRedisRepository.getUnreadCount(userId, conversationId);
    }

    public List<HotConversationSkeleton> loadConversationSkeletons(Long userId, int limit) {
        if (userId == null || limit <= 0) {
            return List.of();
        }

        List<HotConversationSkeleton> skeletons = new ArrayList<>();
        for (String conversationId : listConversationIds(userId, limit)) {
            if (!StringUtils.hasText(conversationId)) {
                continue;
            }
            MessageDTO lastMessage = getLastMessage(conversationId);
            if (lastMessage == null) {
                continue;
            }
            HotConversationSkeleton skeleton = buildSkeleton(userId, conversationId.trim(), lastMessage);
            if (skeleton != null) {
                skeletons.add(skeleton);
            }
        }
        return skeletons;
    }

    private HotConversationSkeleton buildSkeleton(Long userId, String conversationId, MessageDTO lastMessage) {
        if (conversationId.startsWith("g_")) {
            Long groupId = resolveGroupId(conversationId, lastMessage);
            if (groupId == null) {
                return null;
            }
            return new HotConversationSkeleton(
                    conversationId,
                    2,
                    null,
                    groupId,
                    lastMessage,
                    getUnreadCount(userId, conversationId),
                    resolveMessageTime(lastMessage)
            );
        }

        Long peerUserId = resolvePeerUserId(userId, conversationId, lastMessage);
        if (peerUserId == null) {
            return null;
        }
        return new HotConversationSkeleton(
                conversationId,
                1,
                peerUserId,
                null,
                lastMessage,
                getUnreadCount(userId, conversationId),
                resolveMessageTime(lastMessage)
        );
    }

    private Long resolvePeerUserId(Long userId, String conversationId, MessageDTO lastMessage) {
        if (lastMessage != null) {
            if (Objects.equals(lastMessage.getSenderId(), userId)) {
                return lastMessage.getReceiverId();
            }
            if (Objects.equals(lastMessage.getReceiverId(), userId)) {
                return lastMessage.getSenderId();
            }
        }
        if (!StringUtils.hasText(conversationId) || !conversationId.startsWith("p_")) {
            return null;
        }
        String[] parts = conversationId.split("_");
        if (parts.length != 3) {
            return null;
        }
        Long left = Long.valueOf(parts[1]);
        Long right = Long.valueOf(parts[2]);
        if (Objects.equals(left, userId)) {
            return right;
        }
        if (Objects.equals(right, userId)) {
            return left;
        }
        return null;
    }

    private Long resolveGroupId(String conversationId, MessageDTO lastMessage) {
        if (lastMessage != null && lastMessage.getGroupId() != null) {
            return lastMessage.getGroupId();
        }
        if (!StringUtils.hasText(conversationId) || !conversationId.startsWith("g_")) {
            return null;
        }
        return Long.valueOf(conversationId.substring(2));
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

    public record HotConversationSkeleton(String conversationId,
                                          int conversationType,
                                          Long peerUserId,
                                          Long groupId,
                                          MessageDTO lastMessage,
                                          long unreadCount,
                                          LocalDateTime lastMessageTime) {
    }
}
