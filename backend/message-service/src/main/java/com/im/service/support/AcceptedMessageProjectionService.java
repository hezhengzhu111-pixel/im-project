package com.im.service.support;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.enums.MessageEventType;
import com.im.exception.BusinessException;
import com.im.service.ConversationCacheUpdater;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class AcceptedMessageProjectionService {

    private final HotMessageRedisRepository hotMessageRedisRepository;
    private final ConversationCacheUpdater conversationCacheUpdater;

    public void projectAcceptedFirstSeen(MessageEvent event) {
        MessageEvent normalizedEvent = normalizeEvent(event);
        MessageDTO payload = normalizedEvent.getPayload();
        try {
            hotMessageRedisRepository.saveHotMessage(payload);
            if (normalizedEvent.getSenderId() != null && StringUtils.hasText(payload.getClientMessageId())) {
                hotMessageRedisRepository.saveClientMessageMapping(
                        normalizedEvent.getSenderId(),
                        payload.getClientMessageId(),
                        normalizedEvent.getMessageId()
                );
            }
            conversationCacheUpdater.applyFirstSeenAcceptedMessage(normalizedEvent);
            hotMessageRedisRepository.addPendingPersistMessage(
                    normalizedEvent.getConversationId(),
                    normalizedEvent.getMessageId(),
                    LocalDateTime.now()
            );
        } catch (BusinessException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new BusinessException("project accepted message failed", exception);
        }
    }

    public void rehydrateAcceptedProjection(MessageDTO message) {
        MessageDTO normalizedMessage = normalizeMessage(message);
        try {
            hotMessageRedisRepository.saveHotMessage(normalizedMessage);
            if (normalizedMessage.getSenderId() != null && StringUtils.hasText(normalizedMessage.getClientMessageId())) {
                hotMessageRedisRepository.saveClientMessageMapping(
                        normalizedMessage.getSenderId(),
                        normalizedMessage.getClientMessageId(),
                        normalizedMessage.getId()
                );
            }
            conversationCacheUpdater.rehydrateAcceptedMessage(normalizedMessage);
        } catch (BusinessException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new BusinessException("rehydrate accepted projection failed", exception);
        }
    }

    private MessageEvent normalizeEvent(MessageEvent event) {
        if (event == null || event.getMessageId() == null) {
            throw new IllegalArgumentException("message event cannot be null");
        }
        String conversationId = resolveConversationId(event);
        if (!StringUtils.hasText(conversationId)) {
            throw new IllegalArgumentException("conversationId cannot be blank");
        }
        MessageDTO payload = resolvePayload(event);
        payload.setClientMessageId(resolveClientMessageId(event, payload));
        payload.setGroup(event.getGroupId() != null || Boolean.TRUE.equals(event.getGroup()) || payload.isGroup());
        event.setEventType(event.getEventType() == null ? MessageEventType.MESSAGE : event.getEventType());
        event.setConversationId(conversationId);
        event.setClientMessageId(payload.getClientMessageId());
        event.setClientMsgId(payload.getClientMessageId());
        event.setPayload(payload);
        return event;
    }

    private MessageDTO normalizeMessage(MessageDTO message) {
        if (message == null || message.getId() == null) {
            throw new IllegalArgumentException("message cannot be null");
        }
        if (StringUtils.hasText(message.getClientMessageId())) {
            message.setClientMessageId(message.getClientMessageId().trim());
        }
        boolean groupMessage = message.getGroupId() != null
                || message.isGroup()
                || Boolean.TRUE.equals(message.getIsGroupChat())
                || Boolean.TRUE.equals(message.getIsGroupMessage());
        message.setGroup(groupMessage);
        if (message.getCreatedTime() == null) {
            message.setCreatedTime(resolveTimestamp(message));
        }
        if (message.getCreatedAt() == null) {
            message.setCreatedAt(message.getCreatedTime());
        }
        if (message.getUpdatedAt() == null) {
            message.setUpdatedAt(message.getUpdatedTime());
        }
        return message;
    }

    private MessageDTO resolvePayload(MessageEvent event) {
        MessageDTO payload = event.getPayload();
        if (payload == null) {
            LocalDateTime timestamp = resolveTimestamp(event);
            payload = MessageDTO.builder()
                    .id(event.getMessageId())
                    .clientMessageId(resolveClientMessageId(event, null))
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
                    .isGroup(event.getGroupId() != null || Boolean.TRUE.equals(event.getGroup()))
                    .build();
            return payload;
        }

        if (payload.getId() == null) {
            payload.setId(event.getMessageId());
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
        if (payload.getContent() == null) {
            payload.setContent(event.getContent());
        }
        if (payload.getMediaUrl() == null) {
            payload.setMediaUrl(event.getMediaUrl());
        }
        if (payload.getMediaSize() == null) {
            payload.setMediaSize(event.getMediaSize());
        }
        if (payload.getMediaName() == null) {
            payload.setMediaName(event.getMediaName());
        }
        if (payload.getThumbnailUrl() == null) {
            payload.setThumbnailUrl(event.getThumbnailUrl());
        }
        if (payload.getDuration() == null) {
            payload.setDuration(event.getDuration());
        }
        if (payload.getLocationInfo() == null) {
            payload.setLocationInfo(event.getLocationInfo());
        }
        if (payload.getReplyToMessageId() == null) {
            payload.setReplyToMessageId(event.getReplyToMessageId());
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
        if (!StringUtils.hasText(payload.getStatus())) {
            payload.setStatus(event.getStatusText());
        }
        return payload;
    }

    private String resolveClientMessageId(MessageEvent event, MessageDTO payload) {
        if (payload != null && StringUtils.hasText(payload.getClientMessageId())) {
            return payload.getClientMessageId().trim();
        }
        if (StringUtils.hasText(event.getClientMessageId())) {
            return event.getClientMessageId().trim();
        }
        if (StringUtils.hasText(event.getClientMsgId())) {
            return event.getClientMsgId().trim();
        }
        return null;
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
        if (event.getCreatedTime() != null) {
            return event.getCreatedTime();
        }
        if (event.getTimestamp() != null) {
            return event.getTimestamp();
        }
        if (event.getUpdatedTime() != null) {
            return event.getUpdatedTime();
        }
        return LocalDateTime.now();
    }

    private LocalDateTime resolveTimestamp(MessageDTO message) {
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
}
