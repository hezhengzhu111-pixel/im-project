package com.im.service.support;

import com.im.dto.MessageDTO;
import com.im.dto.StatusChangeEvent;
import com.im.mapper.PendingStatusEventBacklogMapper;
import com.im.message.entity.Message;
import com.im.message.entity.PendingStatusEventBacklog;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PendingStatusEventServiceTest {

    @Mock
    private PendingStatusEventBacklogMapper pendingStatusEventBacklogMapper;

    @Test
    void storeShouldFillChangedAtAndInsertDurableBacklog() {
        PendingStatusEventService service = new PendingStatusEventService(pendingStatusEventBacklogMapper);
        StatusChangeEvent event = StatusChangeEvent.builder()
                .messageId(1001L)
                .newStatus(Message.MessageStatus.RECALLED)
                .payload(MessageDTO.builder().id(1001L).status("RECALLED").build())
                .build();

        service.store(event);

        ArgumentCaptor<PendingStatusEventBacklog> captor = ArgumentCaptor.forClass(PendingStatusEventBacklog.class);
        verify(pendingStatusEventBacklogMapper).insert(captor.capture());
        PendingStatusEventBacklog backlog = captor.getValue();
        assertEquals(1001L, backlog.getMessageId());
        assertEquals(Message.MessageStatus.RECALLED, backlog.getNewStatus());
        assertNotNull(backlog.getChangedAt());
        StatusChangeEvent stored = com.alibaba.fastjson2.JSON.parseObject(backlog.getPayloadJson(), StatusChangeEvent.class);
        assertNotNull(stored);
        assertEquals(1001L, stored.getMessageId());
    }

    @Test
    void storeShouldUpsertDuplicateBacklogRecord() {
        PendingStatusEventService service = new PendingStatusEventService(pendingStatusEventBacklogMapper);
        StatusChangeEvent event = StatusChangeEvent.builder()
                .messageId(1002L)
                .newStatus(Message.MessageStatus.DELETED)
                .changedAt(LocalDateTime.of(2026, 4, 16, 12, 5))
                .payload(MessageDTO.builder().id(1002L).status("DELETED").build())
                .build();
        doThrow(new DuplicateKeyException("duplicate"))
                .when(pendingStatusEventBacklogMapper)
                .insert(any(PendingStatusEventBacklog.class));

        service.store(event);

        verify(pendingStatusEventBacklogMapper).updateExisting(
                eq(1002L),
                eq(Message.MessageStatus.DELETED),
                eq(LocalDateTime.of(2026, 4, 16, 12, 5)),
                org.mockito.ArgumentMatchers.contains("\"newStatus\":5")
        );
    }

    @Test
    void listByMessageIdShouldReturnEventsSortedAndStillReplayOldBacklogBeyondOneHour() {
        PendingStatusEventService service = new PendingStatusEventService(pendingStatusEventBacklogMapper);
        PendingStatusEventBacklog oldDeleted = backlog(
                1003L,
                Message.MessageStatus.DELETED,
                LocalDateTime.of(2026, 4, 16, 10, 0),
                statusEvent(1003L, Message.MessageStatus.DELETED, LocalDateTime.of(2026, 4, 16, 10, 0), "DELETED")
        );
        PendingStatusEventBacklog olderRecalled = backlog(
                1003L,
                Message.MessageStatus.RECALLED,
                LocalDateTime.of(2026, 4, 16, 8, 30),
                statusEvent(1003L, Message.MessageStatus.RECALLED, LocalDateTime.of(2026, 4, 16, 8, 30), "RECALLED")
        );
        when(pendingStatusEventBacklogMapper.selectByMessageId(1003L)).thenReturn(List.of(oldDeleted, olderRecalled));

        List<StatusChangeEvent> events = service.listByMessageId(1003L);

        assertEquals(List.of(Message.MessageStatus.RECALLED, Message.MessageStatus.DELETED),
                events.stream().map(StatusChangeEvent::getNewStatus).toList());
        assertEquals(LocalDateTime.of(2026, 4, 16, 8, 30), events.get(0).getChangedAt());
    }

    @Test
    void removeShouldDeleteDurableBacklogRecord() {
        PendingStatusEventService service = new PendingStatusEventService(pendingStatusEventBacklogMapper);

        service.remove(1004L, Message.MessageStatus.DELETED);

        verify(pendingStatusEventBacklogMapper).deleteByMessageIdAndStatus(1004L, Message.MessageStatus.DELETED);
    }

    @Test
    void hasPendingAndListPendingMessageIdsShouldDelegateToDurableBacklog() {
        PendingStatusEventService service = new PendingStatusEventService(pendingStatusEventBacklogMapper);
        when(pendingStatusEventBacklogMapper.existsByMessageIdAndStatus(1005L, Message.MessageStatus.RECALLED)).thenReturn(true);
        when(pendingStatusEventBacklogMapper.selectPendingMessageIds()).thenReturn(List.of(1005L, 1006L));

        assertTrue(service.hasPending(1005L, Message.MessageStatus.RECALLED));
        assertEquals(List.of(1005L, 1006L), service.listPendingMessageIds());
        assertFalse(service.hasPending(null, Message.MessageStatus.RECALLED));
        verify(pendingStatusEventBacklogMapper, never()).existsByMessageIdAndStatus(null, Message.MessageStatus.RECALLED);
    }

    private PendingStatusEventBacklog backlog(Long messageId,
                                              Integer newStatus,
                                              LocalDateTime changedAt,
                                              StatusChangeEvent event) {
        PendingStatusEventBacklog backlog = new PendingStatusEventBacklog();
        backlog.setMessageId(messageId);
        backlog.setNewStatus(newStatus);
        backlog.setChangedAt(changedAt);
        backlog.setPayloadJson(com.alibaba.fastjson2.JSON.toJSONString(event));
        return backlog;
    }

    private StatusChangeEvent statusEvent(Long messageId, Integer status, LocalDateTime changedAt, String statusText) {
        return StatusChangeEvent.builder()
                .messageId(messageId)
                .newStatus(status)
                .changedAt(changedAt)
                .payload(MessageDTO.builder()
                        .id(messageId)
                        .status(statusText)
                        .build())
                .build();
    }
}
