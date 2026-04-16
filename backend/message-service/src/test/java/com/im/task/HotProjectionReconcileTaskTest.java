package com.im.task;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.im.mapper.MessageMapper;
import com.im.message.entity.Message;
import com.im.service.support.PersistenceWatermarkService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class HotProjectionReconcileTaskTest {

    @Mock
    private PersistenceWatermarkService persistenceWatermarkService;

    @Mock
    private MessageMapper messageMapper;

    private HotProjectionReconcileTask hotProjectionReconcileTask;
    private Logger logger;
    private ListAppender<ILoggingEvent> logAppender;

    @BeforeEach
    void setUp() {
        hotProjectionReconcileTask = new HotProjectionReconcileTask(persistenceWatermarkService, messageMapper);
        logger = (Logger) LoggerFactory.getLogger(HotProjectionReconcileTask.class);
        logAppender = new ListAppender<>();
        logAppender.start();
        logger.addAppender(logAppender);
    }

    @AfterEach
    void tearDown() {
        logger.detachAppender(logAppender);
    }

    @Test
    void reconcileShouldMarkPersistedWhenExpiredPendingMessageAlreadyExistsInDb() {
        when(persistenceWatermarkService.listPendingConversationIds()).thenReturn(List.of("p_1_2"));
        when(persistenceWatermarkService.listPendingMessageIdsBefore(eq("p_1_2"), anyLong(), eq(500)))
                .thenReturn(List.of(1001L));
        when(messageMapper.selectById(1001L)).thenReturn(new Message());

        hotProjectionReconcileTask.reconcilePendingPersistState();

        ArgumentCaptor<Long> thresholdCaptor = ArgumentCaptor.forClass(Long.class);
        verify(persistenceWatermarkService).listPendingMessageIdsBefore(eq("p_1_2"), thresholdCaptor.capture(), eq(500));
        assertTrue(thresholdCaptor.getValue() > 0L);
        verify(persistenceWatermarkService).markPersisted("p_1_2", 1001L);
    }

    @Test
    void reconcileShouldKeepPendingAndLogWarnWhenExpiredMessageIsStillMissingInDb() {
        when(persistenceWatermarkService.listPendingConversationIds()).thenReturn(List.of("p_1_2"));
        when(persistenceWatermarkService.listPendingMessageIdsBefore(eq("p_1_2"), anyLong(), eq(500)))
                .thenReturn(List.of(1001L));
        when(messageMapper.selectById(1001L)).thenReturn(null);

        hotProjectionReconcileTask.reconcilePendingPersistState();

        verify(persistenceWatermarkService, never()).markPersisted("p_1_2", 1001L);
        assertTrue(logAppender.list.stream().anyMatch(event ->
                event.getLevel() == Level.WARN
                        && event.getFormattedMessage().contains("Pending persist message still missing in DB")
                        && event.getFormattedMessage().contains("p_1_2")));
    }

    @Test
    void reconcileShouldSkipMessagesThatAreNotExpiredYet() {
        when(persistenceWatermarkService.listPendingConversationIds()).thenReturn(List.of("p_1_2"));
        when(persistenceWatermarkService.listPendingMessageIdsBefore(eq("p_1_2"), anyLong(), eq(500)))
                .thenReturn(List.of());

        hotProjectionReconcileTask.reconcilePendingPersistState();

        verify(messageMapper, never()).selectById(anyLong());
        verify(persistenceWatermarkService, never()).markPersisted(eq("p_1_2"), anyLong());
    }
}
