package com.im.consumer;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
import com.im.mapper.GroupReadCursorMapper;
import com.im.mapper.MessageMapper;
import com.im.mapper.PrivateReadCursorMapper;
import com.im.message.entity.GroupReadCursor;
import com.im.message.entity.Message;
import com.im.message.entity.PrivateReadCursor;
import com.im.service.ConversationCacheUpdater;
import com.im.service.support.PendingStatusEventService;
import com.im.utils.SnowflakeIdGenerator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Objects;

@Slf4j
@Component
@RequiredArgsConstructor
public class KafkaMessageStatePersister {

    private final MessageMapper messageMapper;
    private final GroupReadCursorMapper groupReadCursorMapper;
    private final PrivateReadCursorMapper privateReadCursorMapper;
    private final ConversationCacheUpdater conversationCacheUpdater;
    private final SnowflakeIdGenerator snowflakeIdGenerator;
    private final PendingStatusEventService pendingStatusEventService;

    @KafkaListener(
            topics = "${im.kafka.read-topic:im-read-topic}",
            groupId = "im-read-persister",
            containerFactory = "readEventKafkaListenerContainerFactory"
    )
    public void persistReadEvent(ReadEvent event) {
        if (event == null || event.getUserId() == null || !StringUtils.hasText(event.getConversationId())) {
            return;
        }
        LocalDateTime readAt = event.getTimestamp() == null ? LocalDateTime.now() : event.getTimestamp();
        if (Boolean.TRUE.equals(event.getGroup()) || event.getGroupId() != null) {
            upsertGroupReadCursor(event.getUserId(), event.getGroupId(), readAt);
        } else {
            upsertPrivateReadCursor(event.getUserId(), event.getTargetUserId(), readAt);
        }
        conversationCacheUpdater.markConversationRead(event);
        log.info("Persisted read event. userId={}, conversationId={}, lastReadMessageId={}",
                event.getUserId(), event.getConversationId(), event.getLastReadMessageId());
    }

    @KafkaListener(
            topics = "${im.kafka.status-topic:im-status-topic}",
            groupId = "im-status-persister",
            containerFactory = "statusChangeEventKafkaListenerContainerFactory"
    )
    public void persistStatusChangeEvent(StatusChangeEvent event) {
        if (event == null || event.getMessageId() == null || event.getNewStatus() == null) {
            return;
        }
        LocalDateTime changedAt = event.getChangedAt() == null ? LocalDateTime.now() : event.getChangedAt();
        event.setChangedAt(changedAt);
        Message currentMessage = messageMapper.selectById(event.getMessageId());
        if (currentMessage == null) {
            pendingStatusEventService.store(event);
            log.warn("Stored pending status change event for message not yet persisted. messageId={}, status={}",
                    event.getMessageId(), event.getNewStatus());
            return;
        }
        if (shouldSkipStatusReplay(currentMessage, event.getNewStatus(), changedAt)) {
            pendingStatusEventService.remove(event.getMessageId(), event.getNewStatus());
            log.info("Skipped already-applied status change replay. messageId={}, status={}, messageUpdatedTime={}",
                    event.getMessageId(), event.getNewStatus(), currentMessage.getUpdatedTime());
            return;
        }
        Message updatedMessage = new Message();
        updatedMessage.setId(event.getMessageId());
        updatedMessage.setStatus(event.getNewStatus());
        updatedMessage.setUpdatedTime(changedAt);
        int updated = messageMapper.updateById(updatedMessage);
        if (updated > 0) {
            conversationCacheUpdater.applyStatusChange(event);
            pendingStatusEventService.remove(event.getMessageId(), event.getNewStatus());
            log.info("Persisted status change event. messageId={}, status={}",
                    event.getMessageId(), event.getNewStatus());
            return;
        }
        pendingStatusEventService.store(event);
        log.warn("Stored pending status change event for message not yet persisted. messageId={}, status={}",
                event.getMessageId(), event.getNewStatus());
    }

    private void upsertGroupReadCursor(Long userId, Long groupId, LocalDateTime readAt) {
        if (userId == null || groupId == null) {
            return;
        }
        GroupReadCursor cursor = groupReadCursorMapper.selectOne(new LambdaQueryWrapper<GroupReadCursor>()
                .eq(GroupReadCursor::getGroupId, groupId)
                .eq(GroupReadCursor::getUserId, userId)
                .last("limit 1"));
        if (cursor != null) {
            if (shouldSkipReadUpdate(cursor.getLastReadAt(), readAt)) {
                return;
            }
            cursor.setLastReadAt(readAt);
            groupReadCursorMapper.updateById(cursor);
            return;
        }

        GroupReadCursor created = new GroupReadCursor();
        created.setId(snowflakeIdGenerator.nextId());
        created.setGroupId(groupId);
        created.setUserId(userId);
        created.setLastReadAt(readAt);
        try {
            groupReadCursorMapper.insert(created);
        } catch (DuplicateKeyException duplicate) {
            GroupReadCursor latest = groupReadCursorMapper.selectOne(new LambdaQueryWrapper<GroupReadCursor>()
                    .eq(GroupReadCursor::getGroupId, groupId)
                    .eq(GroupReadCursor::getUserId, userId)
                    .last("limit 1"));
            if (latest != null && shouldSkipReadUpdate(latest.getLastReadAt(), readAt)) {
                return;
            }
            groupReadCursorMapper.update(null, new LambdaUpdateWrapper<GroupReadCursor>()
                    .eq(GroupReadCursor::getGroupId, groupId)
                    .eq(GroupReadCursor::getUserId, userId)
                    .and(wrapper -> wrapper.isNull(GroupReadCursor::getLastReadAt)
                            .or()
                            .lt(GroupReadCursor::getLastReadAt, readAt))
                    .set(GroupReadCursor::getLastReadAt, readAt));
        }
    }

    private void upsertPrivateReadCursor(Long userId, Long peerUserId, LocalDateTime readAt) {
        if (userId == null || peerUserId == null) {
            return;
        }
        PrivateReadCursor cursor = privateReadCursorMapper.selectOne(new LambdaQueryWrapper<PrivateReadCursor>()
                .eq(PrivateReadCursor::getUserId, userId)
                .eq(PrivateReadCursor::getPeerUserId, peerUserId)
                .last("limit 1"));
        if (cursor != null) {
            if (shouldSkipReadUpdate(cursor.getLastReadAt(), readAt)) {
                return;
            }
            cursor.setLastReadAt(readAt);
            privateReadCursorMapper.updateById(cursor);
            return;
        }

        PrivateReadCursor created = new PrivateReadCursor();
        created.setId(snowflakeIdGenerator.nextId());
        created.setUserId(userId);
        created.setPeerUserId(peerUserId);
        created.setLastReadAt(readAt);
        try {
            privateReadCursorMapper.insert(created);
        } catch (DuplicateKeyException duplicate) {
            PrivateReadCursor latest = privateReadCursorMapper.selectOne(new LambdaQueryWrapper<PrivateReadCursor>()
                    .eq(PrivateReadCursor::getUserId, userId)
                    .eq(PrivateReadCursor::getPeerUserId, peerUserId)
                    .last("limit 1"));
            if (latest != null && shouldSkipReadUpdate(latest.getLastReadAt(), readAt)) {
                return;
            }
            privateReadCursorMapper.update(null, new LambdaUpdateWrapper<PrivateReadCursor>()
                    .eq(PrivateReadCursor::getUserId, userId)
                    .eq(PrivateReadCursor::getPeerUserId, peerUserId)
                    .and(wrapper -> wrapper.isNull(PrivateReadCursor::getLastReadAt)
                            .or()
                            .lt(PrivateReadCursor::getLastReadAt, readAt))
                    .set(PrivateReadCursor::getLastReadAt, readAt));
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
}
