package com.im.handler;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.message.entity.Message;
import com.im.service.command.SendMessageCommand;
import com.im.service.orchestrator.MessagePreparation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.util.StringUtils;

@Slf4j
public abstract class AbstractMessageHandler<C> implements MessageHandler {

    @Value("${im.message.text.enforce:true}")
    private boolean textEnforce;

    @Value("${im.message.text.max-length:2000}")
    private int textMaxLength;

    @Override
    public final MessagePreparation prepare(SendMessageCommand command, Long messageId) {
        validateBasicParams(command);
        if (messageId == null) {
            throw new BusinessException("messageId cannot be null");
        }
        C context = buildContext(command);
        Message message = buildMessage(command, context, messageId);
        MessageDTO response = buildResult(command, context, message);
        String conversationId = buildConversationId(command, context, message);
        MessageEvent event = buildMessageEvent(command, message, conversationId, response);
        return new MessagePreparation(command, message, response, event, conversationId);
    }

    protected abstract C buildContext(SendMessageCommand command);

    protected abstract Message buildMessage(SendMessageCommand command, C context, Long messageId);

    protected abstract String buildConversationId(SendMessageCommand command, C context, Message message);

    protected abstract MessageDTO buildResult(SendMessageCommand command, C context, Message message);

    protected void validateBasicParams(SendMessageCommand command) {
        if (command == null) {
            throw new IllegalArgumentException("sendMessageCommand cannot be null");
        }
        if (command.getMessageType() == null) {
            throw new BusinessException("messageType cannot be null");
        }
        if (command.isGroup()) {
            if (command.getGroupId() == null) {
                throw new BusinessException("groupId cannot be null");
            }
            if (command.getReceiverId() != null) {
                throw new BusinessException("receiverId must be null for group message");
            }
            return;
        }
        if (command.getReceiverId() == null) {
            throw new BusinessException("receiverId cannot be null");
        }
        if (command.getGroupId() != null) {
            throw new BusinessException("groupId must be null for private message");
        }
    }

    protected void validateMessageContent(MessageType messageType, String content, String mediaUrl) {
        if ((messageType == MessageType.TEXT || messageType == MessageType.SYSTEM) && !StringUtils.hasText(content)) {
            throw new BusinessException("message content cannot be blank");
        }

        if (messageType == MessageType.TEXT || messageType == MessageType.SYSTEM) {
            if (textEnforce && textMaxLength > 0) {
                int len = content == null ? 0 : content.codePointCount(0, content.length());
                if (len > textMaxLength) {
                    throw new BusinessException("message content exceeds max length " + textMaxLength);
                }
            }
        }

        if (messageType != MessageType.TEXT && messageType != MessageType.SYSTEM && !StringUtils.hasText(mediaUrl)) {
            throw new BusinessException("mediaUrl cannot be blank");
        }
    }

    protected String normalizeClientMessageId(String clientMessageId) {
        if (!StringUtils.hasText(clientMessageId)) {
            return null;
        }
        return clientMessageId.trim();
    }

    protected String requireClientMessageId(String clientMessageId) {
        String normalizedClientMessageId = normalizeClientMessageId(clientMessageId);
        if (!StringUtils.hasText(normalizedClientMessageId)) {
            throw new BusinessException("clientMessageId cannot be blank");
        }
        return normalizedClientMessageId;
    }

    protected Message createBaseMessage(SendMessageCommand command, Long messageId, Long senderId) {
        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        Message message = new Message();
        message.setId(messageId);
        message.setSenderId(senderId);
        message.setClientMessageId(normalizeClientMessageId(command.getClientMessageId()));
        message.setMessageType(command.getMessageType());
        if (command.getMessageType() == MessageType.TEXT || command.getMessageType() == MessageType.SYSTEM) {
            message.setContent(command.getContent());
        } else {
            message.setMediaUrl(command.getMediaUrl());
        }
        message.setMediaSize(command.getMediaSize());
        message.setMediaName(command.getMediaName());
        message.setThumbnailUrl(command.getThumbnailUrl());
        message.setDuration(command.getDuration());
        message.setLocationInfo(command.getLocationInfo());
        message.setReplyToMessageId(command.getReplyToMessageId());
        message.setStatus(Message.MessageStatus.SENT);
        message.setCreatedTime(now);
        message.setUpdatedTime(now);
        return message;
    }

    protected MessageEvent buildMessageEvent(SendMessageCommand command,
                                             Message message,
                                             String conversationId,
                                             MessageDTO payload) {
        return MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(message.getId())
                .conversationId(conversationId)
                .senderId(message.getSenderId())
                .receiverId(message.getReceiverId())
                .groupId(message.getGroupId())
                .clientMsgId(message.getClientMessageId())
                .clientMessageId(message.getClientMessageId())
                .messageType(message.getMessageType())
                .content(message.getContent())
                .mediaUrl(message.getMediaUrl())
                .mediaSize(message.getMediaSize())
                .mediaName(message.getMediaName())
                .thumbnailUrl(message.getThumbnailUrl())
                .duration(message.getDuration())
                .locationInfo(message.getLocationInfo())
                .status(message.getStatus())
                .statusText(payload == null ? null : payload.getStatus())
                .group(Boolean.TRUE.equals(message.getIsGroupChat()))
                .replyToMessageId(message.getReplyToMessageId())
                .timestamp(message.getCreatedTime())
                .createdTime(message.getCreatedTime())
                .updatedTime(message.getUpdatedTime())
                .senderName(payload == null ? null : payload.getSenderName())
                .senderAvatar(payload == null ? null : payload.getSenderAvatar())
                .receiverName(payload == null ? null : payload.getReceiverName())
                .receiverAvatar(payload == null ? null : payload.getReceiverAvatar())
                .payload(payload)
                .version(1)
                .build();
    }

    protected String buildPrivateConversationKey(Long userId1, Long userId2) {
        long a = userId1 == null ? 0L : userId1;
        long b = userId2 == null ? 0L : userId2;
        long min = Math.min(a, b);
        long max = Math.max(a, b);
        return "p_" + min + "_" + max;
    }

    protected String buildGroupConversationKey(Long groupId) {
        return "g_" + (groupId == null ? "0" : groupId.toString());
    }
}
