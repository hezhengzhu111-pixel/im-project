package com.im.service.support;

import com.im.dto.MessageDTO;
import com.im.dto.UserDTO;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.mapper.MessageMapper;
import com.im.message.entity.Message;
import com.im.util.MessageConverter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class HotMessageLookupService {

    private final HotMessageRedisRepository hotMessageRedisRepository;
    private final MessageMapper messageMapper;
    private final UserProfileCache userProfileCache;

    @Value("${im.message.system.sender-id:0}")
    private Long defaultSystemSenderId;

    public MessageDTO getHotMessage(Long messageId) {
        return hotMessageRedisRepository.getHotMessage(messageId);
    }

    public MessageDTO getHotOrPersistedMessage(Long messageId) {
        if (messageId == null) {
            return null;
        }
        MessageDTO hotMessage = getHotMessage(messageId);
        if (hotMessage != null) {
            return hotMessage;
        }
        Message persistedMessage = messageMapper.selectById(messageId);
        return toMessageDTO(persistedMessage);
    }

    public Message requireOwnedMessageForStatusChange(Long operatorUserId,
                                                      Long messageId,
                                                      boolean allowRecalled,
                                                      boolean allowDeleted) {
        if (operatorUserId == null || messageId == null) {
            throw new IllegalArgumentException("operatorUserId and messageId cannot be null");
        }

        MessageDTO hotMessage = getHotMessage(messageId);
        if (hotMessage != null) {
            validateOwnershipAndStatus(operatorUserId, hotMessage.getSenderId(), resolveStatusCode(hotMessage.getStatus()),
                    allowRecalled, allowDeleted);
            return toMessage(hotMessage);
        }

        Message persistedMessage = messageMapper.selectById(messageId);
        if (persistedMessage == null) {
            throw new BusinessException("message not found");
        }
        validateOwnershipAndStatus(operatorUserId, persistedMessage.getSenderId(), persistedMessage.getStatus(),
                allowRecalled, allowDeleted);
        return persistedMessage;
    }

    private void validateOwnershipAndStatus(Long operatorUserId,
                                            Long senderId,
                                            Integer status,
                                            boolean allowRecalled,
                                            boolean allowDeleted) {
        if (senderId == null || !senderId.equals(operatorUserId)) {
            throw new SecurityException("only sender can change message status");
        }
        if (!allowDeleted && Objects.equals(status, Message.MessageStatus.DELETED)) {
            throw new BusinessException("message already deleted");
        }
        if (!allowRecalled && Objects.equals(status, Message.MessageStatus.RECALLED)) {
            throw new BusinessException("message already recalled");
        }
    }

    private MessageDTO toMessageDTO(Message message) {
        if (message == null) {
            return null;
        }
        boolean groupMessage = Boolean.TRUE.equals(message.getIsGroupChat());
        UserDTO sender = message.getSenderId() == null ? null : userProfileCache.getUser(message.getSenderId());
        UserDTO receiver = !groupMessage && message.getReceiverId() != null
                ? userProfileCache.getUser(message.getReceiverId())
                : null;
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

    private Message toMessage(MessageDTO dto) {
        Message message = new Message();
        message.setId(dto.getId());
        message.setSenderId(dto.getSenderId());
        message.setReceiverId(dto.getReceiverId());
        message.setGroupId(dto.getGroupId());
        message.setClientMessageId(dto.getClientMessageId());
        message.setMessageType(dto.getMessageType());
        message.setContent(dto.getContent());
        message.setMediaUrl(dto.getMediaUrl());
        message.setMediaSize(dto.getMediaSize());
        message.setMediaName(dto.getMediaName());
        message.setThumbnailUrl(dto.getThumbnailUrl());
        message.setDuration(dto.getDuration());
        message.setLocationInfo(dto.getLocationInfo());
        message.setStatus(resolveStatusCode(dto.getStatus()));
        message.setIsGroupChat(isGroupMessage(dto));
        message.setReplyToMessageId(dto.getReplyToMessageId());
        message.setCreatedTime(resolveCreatedTime(dto));
        message.setUpdatedTime(resolveUpdatedTime(dto));
        return message;
    }

    private Integer resolveStatusCode(String status) {
        if (!StringUtils.hasText(status)) {
            return Message.MessageStatus.SENT;
        }
        return switch (status.trim().toUpperCase()) {
            case "SENT" -> Message.MessageStatus.SENT;
            case "DELIVERED" -> Message.MessageStatus.DELIVERED;
            case "READ" -> Message.MessageStatus.READ;
            case "RECALLED" -> Message.MessageStatus.RECALLED;
            case "DELETED" -> Message.MessageStatus.DELETED;
            case "1" -> Message.MessageStatus.SENT;
            case "2" -> Message.MessageStatus.DELIVERED;
            case "3" -> Message.MessageStatus.READ;
            case "4" -> Message.MessageStatus.RECALLED;
            case "5" -> Message.MessageStatus.DELETED;
            default -> Message.MessageStatus.SENT;
        };
    }

    private LocalDateTime resolveCreatedTime(MessageDTO dto) {
        if (dto == null) {
            return null;
        }
        if (dto.getCreatedTime() != null) {
            return dto.getCreatedTime();
        }
        if (dto.getCreatedAt() != null) {
            return dto.getCreatedAt();
        }
        if (dto.getUpdatedTime() != null) {
            return dto.getUpdatedTime();
        }
        return dto.getUpdatedAt();
    }

    private LocalDateTime resolveUpdatedTime(MessageDTO dto) {
        if (dto == null) {
            return null;
        }
        if (dto.getUpdatedTime() != null) {
            return dto.getUpdatedTime();
        }
        if (dto.getUpdatedAt() != null) {
            return dto.getUpdatedAt();
        }
        if (dto.getCreatedTime() != null) {
            return dto.getCreatedTime();
        }
        return dto.getCreatedAt();
    }

    private boolean isGroupMessage(MessageDTO dto) {
        return dto != null
                && (dto.isGroup()
                || Boolean.TRUE.equals(dto.getIsGroupChat())
                || Boolean.TRUE.equals(dto.getIsGroupMessage())
                || dto.getGroupId() != null);
    }
}
