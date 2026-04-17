package com.im.consumer;

import com.im.dto.MessageDTO;
import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
import com.im.enums.MessageType;
import com.im.mapper.GroupReadCursorMapper;
import com.im.mapper.MessageMapper;
import com.im.mapper.PrivateReadCursorMapper;
import com.im.message.entity.GroupReadCursor;
import com.im.message.entity.Message;
import com.im.message.entity.PrivateReadCursor;
import com.im.service.ConversationCacheUpdater;
import com.im.service.support.PendingStatusEventService;
import com.im.utils.SnowflakeIdGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class KafkaMessageStatePersisterTest {

    @Mock
    private MessageMapper messageMapper;

    @Mock
    private GroupReadCursorMapper groupReadCursorMapper;

    @Mock
    private PrivateReadCursorMapper privateReadCursorMapper;

    @Mock
    private ConversationCacheUpdater conversationCacheUpdater;

    @Mock
    private SnowflakeIdGenerator snowflakeIdGenerator;

    @Mock
    private PendingStatusEventService pendingStatusEventService;

    private KafkaMessageStatePersister persister;

    @BeforeEach
    void setUp() {
        persister = new KafkaMessageStatePersister(
                messageMapper,
                groupReadCursorMapper,
                privateReadCursorMapper,
                conversationCacheUpdater,
                snowflakeIdGenerator,
                pendingStatusEventService
        );
    }

    @Test
    void persistReadEventShouldUpsertPrivateCursorAndUpdateCache() {
        when(snowflakeIdGenerator.nextId()).thenReturn(9001L);
        when(privateReadCursorMapper.selectOne(any())).thenReturn(null);

        ReadEvent event = ReadEvent.builder()
                .userId(1L)
                .targetUserId(2L)
                .conversationId("p_1_2")
                .lastReadMessageId(300L)
                .timestamp(LocalDateTime.of(2026, 4, 15, 19, 0))
                .build();

        persister.persistReadEvent(event);

        ArgumentCaptor<PrivateReadCursor> cursorCaptor = ArgumentCaptor.forClass(PrivateReadCursor.class);
        verify(privateReadCursorMapper).insert(cursorCaptor.capture());
        PrivateReadCursor cursor = cursorCaptor.getValue();
        assertEquals(9001L, cursor.getId());
        assertEquals(1L, cursor.getUserId());
        assertEquals(2L, cursor.getPeerUserId());
        verify(conversationCacheUpdater).markConversationRead(event);
        verify(messageMapper, never()).update(any(), any());
    }

    @Test
    void persistReadEventShouldNotRollBackExistingGroupCursor() {
        GroupReadCursor cursor = new GroupReadCursor();
        cursor.setId(77L);
        cursor.setLastReadAt(LocalDateTime.of(2026, 4, 15, 19, 6));
        when(groupReadCursorMapper.selectOne(any())).thenReturn(cursor);

        ReadEvent event = ReadEvent.builder()
                .userId(1L)
                .groupId(9L)
                .group(true)
                .conversationId("g_9")
                .timestamp(LocalDateTime.of(2026, 4, 15, 19, 5))
                .build();

        persister.persistReadEvent(event);

        verify(groupReadCursorMapper, never()).updateById(any(GroupReadCursor.class));
        verify(conversationCacheUpdater).markConversationRead(event);
    }

    @Test
    void persistReadEventShouldTreatEqualTimestampAsIdempotent() {
        PrivateReadCursor cursor = existingPrivateCursor(1L, 2L, LocalDateTime.of(2026, 4, 15, 19, 7));
        when(privateReadCursorMapper.selectOne(any())).thenReturn(cursor);

        ReadEvent event = ReadEvent.builder()
                .userId(1L)
                .targetUserId(2L)
                .conversationId("p_1_2")
                .timestamp(LocalDateTime.of(2026, 4, 15, 19, 7))
                .build();

        persister.persistReadEvent(event);

        verify(privateReadCursorMapper, never()).updateById(any(PrivateReadCursor.class));
        verify(conversationCacheUpdater).markConversationRead(event);
    }

    @Test
    void persistReadEventShouldNotRollBackPrivateCursorDuringDuplicateFallback() {
        when(snowflakeIdGenerator.nextId()).thenReturn(9002L);
        when(privateReadCursorMapper.selectOne(any()))
                .thenReturn(null)
                .thenReturn(existingPrivateCursor(1L, 2L, LocalDateTime.of(2026, 4, 15, 19, 8)));
        doThrow(new DuplicateKeyException("duplicate")).when(privateReadCursorMapper).insert(any(PrivateReadCursor.class));

        ReadEvent event = ReadEvent.builder()
                .userId(1L)
                .targetUserId(2L)
                .conversationId("p_1_2")
                .timestamp(LocalDateTime.of(2026, 4, 15, 19, 7))
                .build();

        persister.persistReadEvent(event);

        verify(privateReadCursorMapper, never()).update(any(), any());
        verify(conversationCacheUpdater).markConversationRead(event);
    }

    @Test
    void persistStatusChangeEventShouldApplyStatusAndRemovePendingWhenMessageExists() {
        when(messageMapper.selectById(600L)).thenReturn(persistedMessage(600L, Message.MessageStatus.SENT,
                LocalDateTime.of(2026, 4, 15, 19, 0)));
        when(messageMapper.updateById(any(Message.class))).thenReturn(1);
        StatusChangeEvent event = statusChangeEvent(600L, Message.MessageStatus.RECALLED,
                LocalDateTime.of(2026, 4, 15, 19, 10));

        persister.persistStatusChangeEvent(event);

        verify(messageMapper).updateById(any(Message.class));
        verify(conversationCacheUpdater).applyStatusChange(event);
        verify(pendingStatusEventService).remove(600L, Message.MessageStatus.RECALLED);
        verify(pendingStatusEventService, never()).store(any(StatusChangeEvent.class));
    }

    @Test
    void persistStatusChangeEventShouldStoreDurableBacklogWhenMessageNotYetPersisted() {
        when(messageMapper.selectById(601L)).thenReturn(null);
        StatusChangeEvent event = statusChangeEvent(601L, Message.MessageStatus.DELETED,
                LocalDateTime.of(2026, 4, 15, 19, 11));

        persister.persistStatusChangeEvent(event);

        verify(conversationCacheUpdater, never()).applyStatusChange(any(StatusChangeEvent.class));
        verify(pendingStatusEventService).store(event);
        verify(pendingStatusEventService, never()).remove(any(), any());
        verify(messageMapper, never()).updateById(any(Message.class));
    }

    @Test
    void persistStatusChangeEventShouldRecoverWhenStatusArrivesBeforeMainMessage() {
        StatusChangeEvent event = statusChangeEvent(602L, Message.MessageStatus.RECALLED,
                LocalDateTime.of(2026, 4, 15, 19, 12));
        when(messageMapper.selectById(602L))
                .thenReturn(null)
                .thenReturn(persistedMessage(602L, Message.MessageStatus.SENT, LocalDateTime.of(2026, 4, 15, 19, 0)));
        when(messageMapper.updateById(any(Message.class))).thenReturn(1);

        persister.persistStatusChangeEvent(event);
        persister.persistStatusChangeEvent(event);

        verify(pendingStatusEventService).store(event);
        verify(messageMapper).updateById(any(Message.class));
        verify(conversationCacheUpdater).applyStatusChange(event);
        verify(pendingStatusEventService).remove(602L, Message.MessageStatus.RECALLED);
    }

    @Test
    void persistStatusChangeEventShouldSkipDuplicateReplayWithoutUpdatingAgain() {
        when(messageMapper.selectById(603L)).thenReturn(persistedMessage(
                603L,
                Message.MessageStatus.RECALLED,
                LocalDateTime.of(2026, 4, 15, 19, 15)
        ));
        StatusChangeEvent event = statusChangeEvent(603L, Message.MessageStatus.RECALLED,
                LocalDateTime.of(2026, 4, 15, 19, 15));

        persister.persistStatusChangeEvent(event);

        verify(messageMapper, never()).updateById(any(Message.class));
        verify(conversationCacheUpdater, never()).applyStatusChange(any(StatusChangeEvent.class));
        verify(pendingStatusEventService).remove(603L, Message.MessageStatus.RECALLED);
    }

    private PrivateReadCursor existingPrivateCursor(Long userId, Long peerUserId, LocalDateTime lastReadAt) {
        PrivateReadCursor cursor = new PrivateReadCursor();
        cursor.setId(88L);
        cursor.setUserId(userId);
        cursor.setPeerUserId(peerUserId);
        cursor.setLastReadAt(lastReadAt);
        return cursor;
    }

    private Message persistedMessage(Long id, Integer status, LocalDateTime updatedTime) {
        Message message = new Message();
        message.setId(id);
        message.setStatus(status);
        message.setUpdatedTime(updatedTime);
        return message;
    }

    private StatusChangeEvent statusChangeEvent(Long messageId, Integer status, LocalDateTime changedAt) {
        return StatusChangeEvent.builder()
                .messageId(messageId)
                .newStatus(status)
                .changedAt(changedAt)
                .payload(MessageDTO.builder()
                        .id(messageId)
                        .senderId(1L)
                        .receiverId(2L)
                        .messageType(MessageType.TEXT)
                        .status(status == Message.MessageStatus.RECALLED ? "RECALLED" : "DELETED")
                        .build())
                .build();
    }
}
