package com.im.service;

import com.im.mapper.MessageOutboxMapper;
import com.im.message.entity.MessageOutboxEvent;
import com.im.metrics.MessageServiceMetrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class OutboxServiceTest {

    @Mock
    private MessageOutboxMapper outboxMapper;

    @Mock
    private OutboxPublisher outboxPublisher;

    private OutboxService outboxService;
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        outboxService = new OutboxService(outboxMapper, outboxPublisher);
        meterRegistry = new SimpleMeterRegistry();
        ReflectionTestUtils.setField(outboxService, "metrics", new MessageServiceMetrics(meterRegistry));
    }

    @Test
    void enqueueAfterCommit_shouldInsertEventPublishAndRecordMetricWhenNoTransaction() {
        doAnswer(invocation -> {
            MessageOutboxEvent event = invocation.getArgument(0);
            event.setId(10L);
            return 1;
        }).when(outboxMapper).insert(any(MessageOutboxEvent.class));

        outboxService.enqueueAfterCommit("PRIVATE_MESSAGE", "MESSAGE", "p_1_2", "{}", 100L, List.of(1L, 2L));

        ArgumentCaptor<MessageOutboxEvent> captor = ArgumentCaptor.forClass(MessageOutboxEvent.class);
        verify(outboxMapper).insert(captor.capture());
        assertEquals("MESSAGE", captor.getValue().getEventType());
        verify(outboxPublisher).publishById(10L);
        assertEquals(1.0, meterRegistry.counter("im.message.outbox.enqueue.total", "event_type", "MESSAGE").count());
    }
}
