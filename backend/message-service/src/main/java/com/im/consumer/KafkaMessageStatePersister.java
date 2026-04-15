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
import com.im.utils.SnowflakeIdGenerator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;

@Slf4j
@Component
@RequiredArgsConstructor
public class KafkaMessageStatePersister {

    private final MessageMapper messageMapper;
    private final GroupReadCursorMapper groupReadCursorMapper;
    private final PrivateReadCursorMapper privateReadCursorMapper;
    private final ConversationCacheUpdater conversationCacheUpdater;
    private final SnowflakeIdGenerator snowflakeIdGenerator;

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
        Message updatedMessage = new Message();
        updatedMessage.setId(event.getMessageId());
        updatedMessage.setStatus(event.getNewStatus());
        updatedMessage.setUpdatedTime(changedAt);
        int updated = messageMapper.updateById(updatedMessage);
        if (updated <= 0) {
            log.debug("Ignore status change event for missing message. messageId={}, status={}",
                    event.getMessageId(), event.getNewStatus());
            return;
        }
        conversationCacheUpdater.applyStatusChange(event);
        log.info("Persisted status change event. messageId={}, status={}",
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
            groupReadCursorMapper.update(null, new LambdaUpdateWrapper<GroupReadCursor>()
                    .eq(GroupReadCursor::getGroupId, groupId)
                    .eq(GroupReadCursor::getUserId, userId)
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
            privateReadCursorMapper.update(null, new LambdaUpdateWrapper<PrivateReadCursor>()
                    .eq(PrivateReadCursor::getUserId, userId)
                    .eq(PrivateReadCursor::getPeerUserId, peerUserId)
                    .set(PrivateReadCursor::getLastReadAt, readAt));
        }
    }
}
