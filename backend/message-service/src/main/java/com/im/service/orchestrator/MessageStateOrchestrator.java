package com.im.service.orchestrator;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.im.dto.*;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.handler.MessageHandler;
import com.im.mapper.GroupReadCursorMapper;
import com.im.mapper.MessageMapper;
import com.im.mapper.PrivateReadCursorMapper;
import com.im.message.entity.GroupReadCursor;
import com.im.message.entity.Message;
import com.im.message.entity.PrivateReadCursor;
import com.im.service.ConversationCacheUpdater;
import com.im.service.command.SendMessageCommand;
import com.im.service.support.*;
import com.im.util.MessageConverter;
import com.im.utils.SnowflakeIdGenerator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.function.Supplier;

@Slf4j
@Service
@RequiredArgsConstructor
public class MessageStateOrchestrator {

    private final SnowflakeIdGenerator snowflakeIdGenerator;
    private final HotMessageRedisRepository hotMessageRedisRepository;
    private final AcceptedMessageProjectionService acceptedMessageProjectionService;
    private final MessageMapper messageMapper;
    private final UserProfileCache userProfileCache;
    private final PersistenceWatermarkService persistenceWatermarkService;
    private final PendingStatusEventService pendingStatusEventService;
    private final ConversationCacheUpdater conversationCacheUpdater;
    private final GroupReadCursorMapper groupReadCursorMapper;
    private final PrivateReadCursorMapper privateReadCursorMapper;

    @Value("${im.message.system.sender-id:0}")
    private Long defaultSystemSenderId;

    public MessageDTO handleAcceptedSend(SendMessageCommand command, Supplier<MessageHandler> handlerSupplier) {
        AcceptedStageResult duplicate = resolveDuplicateAccepted(command);
        if (duplicate != null) {
            return duplicate.message();
        }
        MessageHandler handler = handlerSupplier == null ? null : handlerSupplier.get();
        if (handler == null) {
            throw new BusinessException("no matching message handler");
        }
        MessagePreparation preparation = handler.prepare(command, snowflakeIdGenerator.nextId());
        return acceptPreparedMessage(preparation).message();
    }

    public AcceptedStageResult acceptPreparedMessage(MessagePreparation preparation) {
        if (preparation == null) {
            throw new IllegalArgumentException("messagePreparation cannot be null");
        }
        MessageEvent event = preparation.event();
        MessageDTO existingAcceptedMessage = acceptedMessageProjectionService.reserveAcceptedMessage(event);
        if (existingAcceptedMessage != null) {
            return new AcceptedStageResult(
                    AcceptedDisposition.DUPLICATE_DURABLE,
                    rehydrateAcceptedMessage(existingAcceptedMessage)
            );
        }
        try {
            acceptedMessageProjectionService.projectAcceptedFirstSeen(event);
        } catch (Exception exception) {
            log.warn("Accepted message already committed locally; hot projection will be recovered asynchronously. conversationId={}, messageId={}",
                    event.getConversationId(),
                    event.getMessageId(),
                    exception);
        }
        MessageDTO response = preparation.response();
        if (response != null) {
            response.setAckStage(MessageDTO.ACK_STAGE_ACCEPTED);
        }
        return new AcceptedStageResult(AcceptedDisposition.FIRST_ACCEPTED, response);
    }

    public PersistedStageResult advancePersisted(MessageEvent event) {
        if (event == null || event.getMessageId() == null) {
            throw new IllegalArgumentException("message event cannot be null");
        }
        String conversationId = resolveConversationId(event);
        persistenceWatermarkService.markPersisted(conversationId, event.getMessageId());
        try {
            acceptedMessageProjectionService.markPersisted(event);
        } catch (Exception exception) {
            log.warn("Failed to promote accepted/outbox ack stage after persistence. messageId={}",
                    event.getMessageId(), exception);
        }
        int replayedPendingCount = replayPendingStatusEvents(event.getMessageId());
        return new PersistedStageResult(conversationId, event.getMessageId(), replayedPendingCount);
    }

    public ReadStageResult applyReadEvent(ReadEvent event) {
        if (event == null || event.getUserId() == null || !StringUtils.hasText(event.getConversationId())) {
            return new ReadStageResult(ReadDisposition.IGNORED_INVALID, event);
        }
        LocalDateTime readAt = event.getTimestamp() == null ? LocalDateTime.now() : event.getTimestamp();
        boolean updated;
        if (Boolean.TRUE.equals(event.getGroup()) || event.getGroupId() != null) {
            updated = upsertGroupReadCursor(event.getUserId(), event.getGroupId(), readAt);
        } else {
            updated = upsertPrivateReadCursor(event.getUserId(), event.getTargetUserId(), readAt);
        }
        conversationCacheUpdater.markConversationRead(event);
        return new ReadStageResult(updated ? ReadDisposition.APPLIED : ReadDisposition.SKIPPED_STALE, event);
    }

    public StatusStageResult applyStatusEvent(StatusChangeEvent event) {
        if (event == null || event.getMessageId() == null || event.getNewStatus() == null) {
            return new StatusStageResult(StatusDisposition.IGNORED_INVALID, event);
        }
        LocalDateTime changedAt = event.getChangedAt() == null ? LocalDateTime.now() : event.getChangedAt();
        event.setChangedAt(changedAt);
        Message currentMessage = messageMapper.selectById(event.getMessageId());
        if (currentMessage == null) {
            pendingStatusEventService.store(event);
            return new StatusStageResult(StatusDisposition.BACKLOGGED, event);
        }
        if (shouldSkipStatusReplay(currentMessage, event.getNewStatus(), changedAt)) {
            pendingStatusEventService.remove(event.getMessageId(), event.getNewStatus());
            return new StatusStageResult(StatusDisposition.SKIPPED_ALREADY_APPLIED, event);
        }
        Message updatedMessage = new Message();
        updatedMessage.setId(event.getMessageId());
        updatedMessage.setStatus(event.getNewStatus());
        updatedMessage.setUpdatedTime(changedAt);
        int updated = messageMapper.updateById(updatedMessage);
        if (updated > 0) {
            conversationCacheUpdater.applyStatusChange(event);
            pendingStatusEventService.remove(event.getMessageId(), event.getNewStatus());
            return new StatusStageResult(StatusDisposition.APPLIED, event);
        }
        pendingStatusEventService.store(event);
        return new StatusStageResult(StatusDisposition.BACKLOGGED, event);
    }

    public StatusStageResult projectTransientStatusChange(StatusChangeEvent event) {
        if (event == null || event.getMessageId() == null || event.getNewStatus() == null) {
            return new StatusStageResult(StatusDisposition.IGNORED_INVALID, event);
        }
        conversationCacheUpdater.applyStatusChange(event);
        return new StatusStageResult(StatusDisposition.PROJECTED_LOCAL, event);
    }

    private AcceptedStageResult resolveDuplicateAccepted(SendMessageCommand command) {
        if (command == null || command.getSenderId() == null) {
            return null;
        }
        String clientMessageId = normalizeClientMessageId(command.getClientMessageId());
        if (!StringUtils.hasText(clientMessageId)) {
            return null;
        }

        Long mappedMessageId = hotMessageRedisRepository.getMessageIdByClientMessageId(command.getSenderId(), clientMessageId);
        if (mappedMessageId != null) {
            MessageDTO hotMessage = hotMessageRedisRepository.getHotMessage(mappedMessageId);
            if (hotMessage != null) {
                if (!StringUtils.hasText(hotMessage.getAckStage())) {
                    hotMessage.setAckStage(MessageDTO.ACK_STAGE_ACCEPTED);
                }
                return new AcceptedStageResult(AcceptedDisposition.DUPLICATE_HOT, hotMessage);
            }
            MessageDTO durableAcceptedMessage = acceptedMessageProjectionService.findDurableAcceptedMessage(command.getSenderId(), clientMessageId);
            if (durableAcceptedMessage != null) {
                return new AcceptedStageResult(
                        AcceptedDisposition.DUPLICATE_DURABLE,
                        rehydrateAcceptedMessage(durableAcceptedMessage)
                );
            }
            MessageDTO persistedMessage = loadPersistedAcceptedMessage(command.getSenderId(), clientMessageId);
            if (persistedMessage != null) {
                return new AcceptedStageResult(
                        AcceptedDisposition.DUPLICATE_PERSISTED,
                        rehydrateAcceptedMessage(persistedMessage)
                );
            }
            throw new BusinessException("message already accepted but projection and durable persistence are temporarily unavailable");
        }

        MessageDTO durableAcceptedMessage = acceptedMessageProjectionService.findDurableAcceptedMessage(command.getSenderId(), clientMessageId);
        if (durableAcceptedMessage != null) {
            return new AcceptedStageResult(
                    AcceptedDisposition.DUPLICATE_DURABLE,
                    rehydrateAcceptedMessage(durableAcceptedMessage)
            );
        }
        MessageDTO persistedMessage = loadPersistedAcceptedMessage(command.getSenderId(), clientMessageId);
        if (persistedMessage == null) {
            return null;
        }
        return new AcceptedStageResult(
                AcceptedDisposition.DUPLICATE_PERSISTED,
                rehydrateAcceptedMessage(persistedMessage)
        );
    }

    private int replayPendingStatusEvents(Long messageId) {
        if (messageId == null) {
            return 0;
        }
        List<StatusChangeEvent> pendingEvents = pendingStatusEventService.listByMessageId(messageId);
        if (pendingEvents == null || pendingEvents.isEmpty()) {
            return 0;
        }
        int replayedCount = 0;
        for (StatusChangeEvent pendingEvent : pendingEvents) {
            if (pendingEvent == null) {
                continue;
            }
            try {
                applyStatusEvent(pendingEvent);
                replayedCount++;
            } catch (Exception exception) {
                log.warn("Immediate pending status replay failed after message persistence. messageId={}, status={}, error={}",
                        messageId, pendingEvent.getNewStatus(), exception.getMessage(), exception);
            }
        }
        return replayedCount;
    }

    private MessageDTO loadPersistedAcceptedMessage(Long senderId, String clientMessageId) {
        if (senderId == null || !StringUtils.hasText(clientMessageId)) {
            return null;
        }
        Message persisted = messageMapper.selectBySenderIdAndClientMessageId(senderId, clientMessageId.trim());
        if (persisted == null) {
            return null;
        }
        return buildMessageDTOFromMessage(persisted);
    }

    private MessageDTO rehydrateAcceptedMessage(MessageDTO message) {
        if (message == null) {
            return null;
        }
        if (!StringUtils.hasText(message.getAckStage())) {
            message.setAckStage(MessageDTO.ACK_STAGE_ACCEPTED);
        }
        acceptedMessageProjectionService.rehydrateAcceptedProjection(message);
        return message;
    }

    private MessageDTO buildMessageDTOFromMessage(Message message) {
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
            dto.setAckStage(MessageDTO.ACK_STAGE_PERSISTED);
        }
        return dto;
    }

    private String resolveSenderName(Message message, UserDTO sender) {
        if (sender != null) {
            return sender.getUsername();
        }
        if (message != null && message.getMessageType() == MessageType.SYSTEM && isSystemConversationUser(message.getSenderId())) {
            return "SYSTEM";
        }
        return null;
    }

    private boolean isSystemConversationUser(Long peerUserId) {
        return peerUserId != null && Objects.equals(peerUserId, defaultSystemSenderId);
    }

    private String normalizeClientMessageId(String clientMessageId) {
        if (!StringUtils.hasText(clientMessageId)) {
            return null;
        }
        return clientMessageId.trim();
    }

    private boolean upsertGroupReadCursor(Long userId, Long groupId, LocalDateTime readAt) {
        if (userId == null || groupId == null) {
            return false;
        }
        GroupReadCursor cursor = groupReadCursorMapper.selectOne(new LambdaQueryWrapper<GroupReadCursor>()
                .eq(GroupReadCursor::getGroupId, groupId)
                .eq(GroupReadCursor::getUserId, userId)
                .last("limit 1"));
        if (cursor != null) {
            if (shouldSkipReadUpdate(cursor.getLastReadAt(), readAt)) {
                return false;
            }
            cursor.setLastReadAt(readAt);
            groupReadCursorMapper.updateById(cursor);
            return true;
        }

        GroupReadCursor created = new GroupReadCursor();
        created.setId(snowflakeIdGenerator.nextId());
        created.setGroupId(groupId);
        created.setUserId(userId);
        created.setLastReadAt(readAt);
        try {
            groupReadCursorMapper.insert(created);
            return true;
        } catch (DuplicateKeyException duplicate) {
            GroupReadCursor latest = groupReadCursorMapper.selectOne(new LambdaQueryWrapper<GroupReadCursor>()
                    .eq(GroupReadCursor::getGroupId, groupId)
                    .eq(GroupReadCursor::getUserId, userId)
                    .last("limit 1"));
            if (latest != null && shouldSkipReadUpdate(latest.getLastReadAt(), readAt)) {
                return false;
            }
            return groupReadCursorMapper.update(null, new LambdaUpdateWrapper<GroupReadCursor>()
                    .eq(GroupReadCursor::getGroupId, groupId)
                    .eq(GroupReadCursor::getUserId, userId)
                    .and(wrapper -> wrapper.isNull(GroupReadCursor::getLastReadAt)
                            .or()
                            .lt(GroupReadCursor::getLastReadAt, readAt))
                    .set(GroupReadCursor::getLastReadAt, readAt)) > 0;
        }
    }

    private boolean upsertPrivateReadCursor(Long userId, Long peerUserId, LocalDateTime readAt) {
        if (userId == null || peerUserId == null) {
            return false;
        }
        PrivateReadCursor cursor = privateReadCursorMapper.selectOne(new LambdaQueryWrapper<PrivateReadCursor>()
                .eq(PrivateReadCursor::getUserId, userId)
                .eq(PrivateReadCursor::getPeerUserId, peerUserId)
                .last("limit 1"));
        if (cursor != null) {
            if (shouldSkipReadUpdate(cursor.getLastReadAt(), readAt)) {
                return false;
            }
            cursor.setLastReadAt(readAt);
            privateReadCursorMapper.updateById(cursor);
            return true;
        }

        PrivateReadCursor created = new PrivateReadCursor();
        created.setId(snowflakeIdGenerator.nextId());
        created.setUserId(userId);
        created.setPeerUserId(peerUserId);
        created.setLastReadAt(readAt);
        try {
            privateReadCursorMapper.insert(created);
            return true;
        } catch (DuplicateKeyException duplicate) {
            PrivateReadCursor latest = privateReadCursorMapper.selectOne(new LambdaQueryWrapper<PrivateReadCursor>()
                    .eq(PrivateReadCursor::getUserId, userId)
                    .eq(PrivateReadCursor::getPeerUserId, peerUserId)
                    .last("limit 1"));
            if (latest != null && shouldSkipReadUpdate(latest.getLastReadAt(), readAt)) {
                return false;
            }
            return privateReadCursorMapper.update(null, new LambdaUpdateWrapper<PrivateReadCursor>()
                    .eq(PrivateReadCursor::getUserId, userId)
                    .eq(PrivateReadCursor::getPeerUserId, peerUserId)
                    .and(wrapper -> wrapper.isNull(PrivateReadCursor::getLastReadAt)
                            .or()
                            .lt(PrivateReadCursor::getLastReadAt, readAt))
                    .set(PrivateReadCursor::getLastReadAt, readAt)) > 0;
        }
    }

    private boolean shouldSkipReadUpdate(LocalDateTime currentLastReadAt, LocalDateTime candidateReadAt) {
        return currentLastReadAt != null
                && (candidateReadAt == null || !candidateReadAt.isAfter(currentLastReadAt));
    }

    private boolean shouldSkipStatusReplay(Message currentMessage, Integer newStatus, LocalDateTime changedAt) {
        if (currentMessage == null || changedAt == null) {
            return false;
        }
        LocalDateTime currentUpdatedTime = currentMessage.getUpdatedTime();
        if (Objects.equals(currentMessage.getStatus(), newStatus)
                && currentUpdatedTime != null
                && !changedAt.isAfter(currentUpdatedTime)) {
            return true;
        }
        return currentUpdatedTime != null && currentUpdatedTime.isAfter(changedAt);
    }

    private String resolveConversationId(MessageEvent event) {
        if (event == null) {
            throw new IllegalArgumentException("message event cannot be null");
        }
        if (StringUtils.hasText(event.getConversationId())) {
            return event.getConversationId().trim();
        }
        if (event.getGroupId() != null || Boolean.TRUE.equals(event.getGroup())) {
            if (event.getGroupId() == null) {
                throw new IllegalArgumentException("groupId cannot be null for group message");
            }
            return "g_" + event.getGroupId();
        }
        if (event.getSenderId() == null || event.getReceiverId() == null) {
            throw new IllegalArgumentException("senderId and receiverId cannot be null for private message");
        }
        long min = Math.min(event.getSenderId(), event.getReceiverId());
        long max = Math.max(event.getSenderId(), event.getReceiverId());
        return "p_" + min + "_" + max;
    }

    public enum AcceptedDisposition {
        FIRST_ACCEPTED,
        DUPLICATE_HOT,
        DUPLICATE_DURABLE,
        DUPLICATE_PERSISTED
    }

    public enum ReadDisposition {
        APPLIED,
        SKIPPED_STALE,
        IGNORED_INVALID
    }

    public enum StatusDisposition {
        APPLIED,
        BACKLOGGED,
        SKIPPED_ALREADY_APPLIED,
        PROJECTED_LOCAL,
        IGNORED_INVALID
    }

    public record AcceptedStageResult(AcceptedDisposition disposition, MessageDTO message) {
    }

    public record PersistedStageResult(String conversationId, Long messageId, int replayedPendingCount) {
    }

    public record ReadStageResult(ReadDisposition disposition, ReadEvent event) {
    }

    public record StatusStageResult(StatusDisposition disposition, StatusChangeEvent event) {
    }
}
