package com.im.service.support;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.enums.MessageEventType;
import com.im.exception.BusinessException;
import com.im.mapper.AcceptedMessageMapper;
import com.im.mapper.MessageOutboxMapper;
import com.im.message.entity.AcceptedMessage;
import com.im.message.entity.MessageOutbox;
import com.im.metrics.MessageServiceMetrics;
import com.im.service.ConversationCacheUpdater;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class AcceptedMessageProjectionService {

    private final HotMessageRedisRepository hotMessageRedisRepository;
    private final ConversationCacheUpdater conversationCacheUpdater;
    private final AcceptedMessageMapper acceptedMessageMapper;
    private final MessageOutboxMapper messageOutboxMapper;

    @Autowired(required = false)
    private MessageServiceMetrics metrics;

    @Value("${im.kafka.chat-topic:im-chat-topic}")
    private String chatTopic = "im-chat-topic";

    @Transactional
    public MessageDTO reserveAcceptedMessage(MessageEvent event) {
        MessageEvent normalizedEvent = normalizeEvent(event);
        MessageDTO payload = normalizedEvent.getPayload();
        if (normalizedEvent.getSenderId() == null || !StringUtils.hasText(payload.getClientMessageId())) {
            return null;
        }
        applyAckStage(payload, MessageDTO.ACK_STAGE_ACCEPTED);
        try {
            acceptedMessageMapper.insert(toAcceptedMessage(normalizedEvent, payload));
            messageOutboxMapper.insert(toMessageOutbox(normalizedEvent));
            return null;
        } catch (DuplicateKeyException duplicateKeyException) {
            MessageDTO existing = findDurableAcceptedMessage(normalizedEvent.getSenderId(), payload.getClientMessageId());
            if (existing != null) {
                return existing;
            }
            throw new BusinessException("accepted message already reserved but durable snapshot is unavailable", duplicateKeyException);
        }
    }

    public MessageDTO findDurableAcceptedMessage(Long senderId, String clientMessageId) {
        if (senderId == null || !StringUtils.hasText(clientMessageId)) {
            return null;
        }
        AcceptedMessage acceptedMessage = acceptedMessageMapper.selectBySenderIdAndClientMessageId(senderId, clientMessageId.trim());
        if (acceptedMessage == null || !StringUtils.hasText(acceptedMessage.getPayloadJson())) {
            return null;
        }
        try {
            MessageDTO message = normalizeMessage(JSON.parseObject(acceptedMessage.getPayloadJson(), MessageDTO.class));
            applyAckStage(message, resolveAckStage(acceptedMessage.getAckStage()));
            return message;
        } catch (Exception exception) {
            throw new BusinessException("deserialize accepted message snapshot failed", exception);
        }
    }

    public void releaseAcceptedReservation(Long senderId, String clientMessageId, Long messageId) {
        if (senderId == null || messageId == null || !StringUtils.hasText(clientMessageId)) {
            return;
        }
        acceptedMessageMapper.deleteBySenderIdAndClientMessageIdAndMessageId(senderId, clientMessageId.trim(), messageId);
        messageOutboxMapper.deleteById(messageId);
    }

    public void projectAcceptedFirstSeen(MessageEvent event) {
        MessageEvent normalizedEvent = normalizeEvent(event);
        MessageDTO payload = normalizedEvent.getPayload();
        applyAckStage(payload, MessageDTO.ACK_STAGE_ACCEPTED);
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
                    resolveAcceptedTime(normalizedEvent, payload)
            );
        } catch (BusinessException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new BusinessException("project accepted message failed", exception);
        }
    }

    public void rehydrateAcceptedProjection(MessageDTO message) {
        MessageDTO normalizedMessage = normalizeMessage(message);
        if (!StringUtils.hasText(normalizedMessage.getAckStage())) {
            applyAckStage(normalizedMessage, MessageDTO.ACK_STAGE_ACCEPTED);
        }
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

    public void markPersisted(MessageEvent event) {
        MessageEvent normalizedEvent = normalizeEvent(event);
        MessageDTO payload = normalizedEvent.getPayload();
        applyAckStage(payload, MessageDTO.ACK_STAGE_PERSISTED);
        recordAcceptedToPersistedLatency(normalizedEvent.getMessageId());
        acceptedMessageMapper.updateAckStageById(normalizedEvent.getMessageId(), MessageDTO.ACK_STAGE_PERSISTED);
        messageOutboxMapper.markPersistedById(normalizedEvent.getMessageId());
        hotMessageRedisRepository.saveHotMessage(payload);
        if (normalizedEvent.getSenderId() != null && StringUtils.hasText(payload.getClientMessageId())) {
            hotMessageRedisRepository.saveClientMessageMapping(
                    normalizedEvent.getSenderId(),
                    payload.getClientMessageId(),
                    normalizedEvent.getMessageId()
            );
        }
    }

    private void recordAcceptedToPersistedLatency(Long messageId) {
        if (metrics == null || messageId == null) {
            return;
        }
        AcceptedMessage acceptedMessage = acceptedMessageMapper.selectById(messageId);
        if (acceptedMessage == null || acceptedMessage.getCreatedTime() == null) {
            return;
        }
        metrics.recordAcceptedToPersistedLatency(
                Duration.between(acceptedMessage.getCreatedTime(), LocalDateTime.now())
        );
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
                    .ackStage(MessageDTO.ACK_STAGE_ACCEPTED)
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
        if (!StringUtils.hasText(payload.getAckStage())) {
            payload.setAckStage(MessageDTO.ACK_STAGE_ACCEPTED);
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

    private LocalDateTime resolveAcceptedTime(MessageEvent normalizedEvent, MessageDTO payload) {
        if (normalizedEvent != null && normalizedEvent.getCreatedTime() != null) {
            return normalizedEvent.getCreatedTime();
        }
        if (payload != null && payload.getCreatedTime() != null) {
            return payload.getCreatedTime();
        }
        return LocalDateTime.now();
    }

    private AcceptedMessage toAcceptedMessage(MessageEvent normalizedEvent, MessageDTO payload) {
        LocalDateTime acceptedTime = resolveAcceptedTime(normalizedEvent, payload);
        AcceptedMessage acceptedMessage = new AcceptedMessage();
        acceptedMessage.setId(normalizedEvent.getMessageId());
        acceptedMessage.setSenderId(normalizedEvent.getSenderId());
        acceptedMessage.setClientMessageId(payload.getClientMessageId());
        acceptedMessage.setConversationId(normalizedEvent.getConversationId());
        acceptedMessage.setAckStage(resolveAckStage(payload.getAckStage()));
        acceptedMessage.setPayloadJson(JSON.toJSONString(payload));
        acceptedMessage.setCreatedTime(acceptedTime);
        acceptedMessage.setUpdatedTime(acceptedTime);
        return acceptedMessage;
    }

    private MessageOutbox toMessageOutbox(MessageEvent normalizedEvent) {
        LocalDateTime createdTime = resolveAcceptedTime(normalizedEvent, normalizedEvent.getPayload());
        MessageOutbox messageOutbox = new MessageOutbox();
        messageOutbox.setId(normalizedEvent.getMessageId());
        messageOutbox.setSenderId(normalizedEvent.getSenderId());
        messageOutbox.setClientMessageId(normalizedEvent.getPayload().getClientMessageId());
        messageOutbox.setConversationId(normalizedEvent.getConversationId());
        messageOutbox.setTopic(chatTopic);
        messageOutbox.setRoutingKey(normalizedEvent.getConversationId());
        messageOutbox.setEventJson(JSON.toJSONString(normalizedEvent));
        messageOutbox.setDispatchStatus("PENDING");
        messageOutbox.setAttemptCount(0);
        messageOutbox.setNextAttemptTime(createdTime);
        messageOutbox.setCreatedTime(createdTime);
        messageOutbox.setUpdatedTime(createdTime);
        return messageOutbox;
    }

    private void applyAckStage(MessageDTO payload, String ackStage) {
        if (payload == null) {
            return;
        }
        payload.setAckStage(resolveAckStage(ackStage));
    }

    private String resolveAckStage(String ackStage) {
        if (MessageDTO.ACK_STAGE_PERSISTED.equalsIgnoreCase(ackStage)) {
            return MessageDTO.ACK_STAGE_PERSISTED;
        }
        return MessageDTO.ACK_STAGE_ACCEPTED;
    }
}
