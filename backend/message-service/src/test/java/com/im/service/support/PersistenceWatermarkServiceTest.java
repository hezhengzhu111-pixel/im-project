package com.im.service.support;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PersistenceWatermarkServiceTest {

    @Mock
    private HotMessageRedisRepository hotMessageRedisRepository;

    private PersistenceWatermarkService persistenceWatermarkService;

    @BeforeEach
    void setUp() {
        persistenceWatermarkService = new PersistenceWatermarkService(hotMessageRedisRepository);
    }

    @Test
    void addPendingShouldDelegateToRepository() {
        LocalDateTime acceptedAt = LocalDateTime.of(2026, 4, 16, 0, 30);

        persistenceWatermarkService.addPending("p_1_2", 1001L, acceptedAt);

        verify(hotMessageRedisRepository).addPendingPersistMessage("p_1_2", 1001L, acceptedAt);
    }

    @Test
    void markPersistedShouldAdvanceWatermarkBeforeRemovingPending() {
        persistenceWatermarkService.markPersisted("p_1_2", 1001L);

        InOrder inOrder = org.mockito.Mockito.inOrder(hotMessageRedisRepository);
        inOrder.verify(hotMessageRedisRepository).savePersistedWatermark("p_1_2", 1001L);
        inOrder.verify(hotMessageRedisRepository).removePendingPersistMessage("p_1_2", 1001L);
    }

    @Test
    void markPersistedShouldNotMoveWatermarkBackward() {
        AtomicReference<Long> watermark = new AtomicReference<>();
        doAnswer(invocation -> {
            Long next = invocation.getArgument(1);
            watermark.updateAndGet(current -> current == null || next > current ? next : current);
            return null;
        }).when(hotMessageRedisRepository).savePersistedWatermark(eq("p_1_2"), anyLong());
        when(hotMessageRedisRepository.getPersistedWatermark("p_1_2")).thenAnswer(invocation -> watermark.get());

        persistenceWatermarkService.markPersisted("p_1_2", 100L);
        persistenceWatermarkService.markPersisted("p_1_2", 99L);

        assertEquals(100L, persistenceWatermarkService.getPersistedWatermark("p_1_2"));
    }

    @Test
    void markPersistedShouldMoveWatermarkForward() {
        AtomicReference<Long> watermark = new AtomicReference<>();
        doAnswer(invocation -> {
            Long next = invocation.getArgument(1);
            watermark.updateAndGet(current -> current == null || next > current ? next : current);
            return null;
        }).when(hotMessageRedisRepository).savePersistedWatermark(eq("p_1_2"), anyLong());
        when(hotMessageRedisRepository.getPersistedWatermark("p_1_2")).thenAnswer(invocation -> watermark.get());

        persistenceWatermarkService.markPersisted("p_1_2", 100L);
        persistenceWatermarkService.markPersisted("p_1_2", 101L);

        assertEquals(101L, persistenceWatermarkService.getPersistedWatermark("p_1_2"));
    }

    @Test
    void getPersistedWatermarkShouldReturnNullWhenRepositoryMissesValue() {
        when(hotMessageRedisRepository.getPersistedWatermark("p_1_2")).thenReturn(null);

        Long watermark = assertDoesNotThrow(() -> persistenceWatermarkService.getPersistedWatermark("p_1_2"));

        assertNull(watermark);
    }

    @Test
    void shouldDelegateRemainingPendingQueries() {
        when(hotMessageRedisRepository.listPendingPersistMessageIds("p_1_2", 10)).thenReturn(List.of(1001L, 1002L));
        when(hotMessageRedisRepository.listPendingPersistMessageIdsBefore("p_1_2", 1234L, 10)).thenReturn(List.of(1001L));
        when(hotMessageRedisRepository.listPendingPersistConversationIds()).thenReturn(List.of("p_1_2", "g_8"));
        when(hotMessageRedisRepository.hasPendingPersistMessage("p_1_2", 1001L)).thenReturn(true);

        assertEquals(List.of(1001L, 1002L), persistenceWatermarkService.listPendingMessageIds("p_1_2", 10));
        assertEquals(List.of(1001L), persistenceWatermarkService.listPendingMessageIdsBefore("p_1_2", 1234L, 10));
        assertEquals(List.of("p_1_2", "g_8"), persistenceWatermarkService.listPendingConversationIds());
        assertEquals(true, persistenceWatermarkService.hasPending("p_1_2", 1001L));
    }
}
