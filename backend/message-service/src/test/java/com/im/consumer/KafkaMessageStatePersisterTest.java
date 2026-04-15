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
import com.im.utils.SnowflakeIdGenerator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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

    @Test
    void persistReadEventShouldUpsertPrivateCursorAndUpdateCache() {
        KafkaMessageStatePersister persister = new KafkaMessageStatePersister(
                messageMapper,
                groupReadCursorMapper,
                privateReadCursorMapper,
                conversationCacheUpdater,
                snowflakeIdGenerator
        );
        when(snowflakeIdGenerator.nextId()).thenReturn(9001L);
        when(privateReadCursorMapper.selectOne(any())).thenReturn(null);

        ReadEvent event = ReadEvent.builder()
                .userId(1L)
                .targetUserId(2L)
                .conversationId("1_2")
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
    void persistReadEventShouldUpdateExistingGroupCursor() {
        KafkaMessageStatePersister persister = new KafkaMessageStatePersister(
                messageMapper,
                groupReadCursorMapper,
                privateReadCursorMapper,
                conversationCacheUpdater,
                snowflakeIdGenerator
        );
        GroupReadCursor cursor = new GroupReadCursor();
        cursor.setId(77L);
        when(groupReadCursorMapper.selectOne(any())).thenReturn(cursor);

        ReadEvent event = ReadEvent.builder()
                .userId(1L)
                .groupId(9L)
                .group(true)
                .conversationId("group_9")
                .timestamp(LocalDateTime.of(2026, 4, 15, 19, 5))
                .build();

        persister.persistReadEvent(event);

        verify(groupReadCursorMapper).updateById(cursor);
        verify(conversationCacheUpdater).markConversationRead(event);
    }

    @Test
    void persistStatusChangeEventShouldUpdateMessageAndCache() {
        KafkaMessageStatePersister persister = new KafkaMessageStatePersister(
                messageMapper,
                groupReadCursorMapper,
                privateReadCursorMapper,
                conversationCacheUpdater,
                snowflakeIdGenerator
        );
        when(messageMapper.updateById(any(Message.class))).thenReturn(1);
        StatusChangeEvent event = StatusChangeEvent.builder()
                .messageId(600L)
                .newStatus(Message.MessageStatus.RECALLED)
                .changedAt(LocalDateTime.of(2026, 4, 15, 19, 10))
                .payload(MessageDTO.builder()
                        .id(600L)
                        .senderId(1L)
                        .receiverId(2L)
                        .messageType(MessageType.TEXT)
                        .status("RECALLED")
                        .build())
                .build();

        persister.persistStatusChangeEvent(event);

        verify(messageMapper).updateById(any(Message.class));
        verify(conversationCacheUpdater).applyStatusChange(event);
    }
}
