package com.im.service.support;

import com.im.dto.MessageDTO;
import com.im.dto.StatusChangeEvent;
import com.im.message.entity.Message;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PendingStatusEventServiceTest {

    @Mock
    private HotMessageRedisRepository hotMessageRedisRepository;

    @Test
    void storeShouldFillChangedAtAndDelegateToRepository() {
        PendingStatusEventService service = new PendingStatusEventService(hotMessageRedisRepository);
        StatusChangeEvent event = StatusChangeEvent.builder()
                .messageId(1001L)
                .newStatus(Message.MessageStatus.RECALLED)
                .payload(MessageDTO.builder().id(1001L).status("RECALLED").build())
                .build();

        service.store(event);

        ArgumentCaptor<StatusChangeEvent> captor = ArgumentCaptor.forClass(StatusChangeEvent.class);
        verify(hotMessageRedisRepository).saveStatusPending(eq(1001L), eq(Message.MessageStatus.RECALLED), captor.capture());
        assertNotNull(captor.getValue().getChangedAt());
    }

    @Test
    void listByMessageIdShouldReturnEventsSortedByChangedAtAscending() {
        PendingStatusEventService service = new PendingStatusEventService(hotMessageRedisRepository);
        StatusChangeEvent deleted = StatusChangeEvent.builder()
                .messageId(1002L)
                .newStatus(Message.MessageStatus.DELETED)
                .changedAt(LocalDateTime.of(2026, 4, 16, 11, 10))
                .build();
        StatusChangeEvent recalled = StatusChangeEvent.builder()
                .messageId(1002L)
                .newStatus(Message.MessageStatus.RECALLED)
                .changedAt(LocalDateTime.of(2026, 4, 16, 11, 5))
                .build();
        when(hotMessageRedisRepository.listPendingStatusEvents(1002L)).thenReturn(List.of(deleted, recalled));

        List<StatusChangeEvent> events = service.listByMessageId(1002L);

        assertEquals(List.of(Message.MessageStatus.RECALLED, Message.MessageStatus.DELETED),
                events.stream().map(StatusChangeEvent::getNewStatus).toList());
    }

    @Test
    void removeShouldDelegateToRepository() {
        PendingStatusEventService service = new PendingStatusEventService(hotMessageRedisRepository);

        service.remove(1003L, Message.MessageStatus.DELETED);

        verify(hotMessageRedisRepository).removePendingStatus(1003L, Message.MessageStatus.DELETED);
    }

    @Test
    void hasPendingAndListPendingMessageIdsShouldDelegateToRepository() {
        PendingStatusEventService service = new PendingStatusEventService(hotMessageRedisRepository);
        when(hotMessageRedisRepository.hasPendingStatus(1004L, Message.MessageStatus.RECALLED)).thenReturn(true);
        when(hotMessageRedisRepository.listPendingStatusMessageIds()).thenReturn(List.of(1004L, 1005L));

        assertTrue(service.hasPending(1004L, Message.MessageStatus.RECALLED));
        assertEquals(List.of(1004L, 1005L), service.listPendingMessageIds());
    }
}
