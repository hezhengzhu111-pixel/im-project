package com.im.task;

import com.im.consumer.KafkaMessageStatePersister;
import com.im.dto.StatusChangeEvent;
import com.im.mapper.MessageMapper;
import com.im.message.entity.Message;
import com.im.service.support.PendingStatusEventService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PendingStatusReplayTaskTest {

    @Mock
    private PendingStatusEventService pendingStatusEventService;

    @Mock
    private MessageMapper messageMapper;

    @Mock
    private KafkaMessageStatePersister kafkaMessageStatePersister;

    private PendingStatusReplayTask task;

    @BeforeEach
    void setUp() {
        task = new PendingStatusReplayTask(
                pendingStatusEventService,
                messageMapper,
                kafkaMessageStatePersister
        );
    }

    @Test
    void replayPendingStatusEventsShouldReplayWhenMessageAlreadyPersisted() {
        Long messageId = 1001L;
        when(pendingStatusEventService.listPendingMessageIds()).thenReturn(List.of(messageId));
        when(messageMapper.selectById(messageId)).thenReturn(new Message());
        StatusChangeEvent recalled = statusEvent(messageId, Message.MessageStatus.RECALLED,
                LocalDateTime.of(2026, 4, 16, 12, 0));
        StatusChangeEvent deleted = statusEvent(messageId, Message.MessageStatus.DELETED,
                LocalDateTime.of(2026, 4, 16, 12, 1));
        when(pendingStatusEventService.listByMessageId(messageId)).thenReturn(List.of(recalled, deleted));

        task.replayPendingStatusEvents();

        InOrder inOrder = inOrder(kafkaMessageStatePersister);
        inOrder.verify(kafkaMessageStatePersister).persistStatusChangeEvent(recalled);
        inOrder.verify(kafkaMessageStatePersister).persistStatusChangeEvent(deleted);
    }

    @Test
    void replayPendingStatusEventsShouldSkipWhenMessageNotYetPersisted() {
        Long messageId = 1002L;
        when(pendingStatusEventService.listPendingMessageIds()).thenReturn(List.of(messageId));
        when(messageMapper.selectById(messageId)).thenReturn(null);

        task.replayPendingStatusEvents();

        verify(pendingStatusEventService, never()).listByMessageId(messageId);
        verify(kafkaMessageStatePersister, never()).persistStatusChangeEvent(any(StatusChangeEvent.class));
    }

    private StatusChangeEvent statusEvent(Long messageId, Integer status, LocalDateTime changedAt) {
        return StatusChangeEvent.builder()
                .messageId(messageId)
                .newStatus(status)
                .changedAt(changedAt)
                .build();
    }
}
