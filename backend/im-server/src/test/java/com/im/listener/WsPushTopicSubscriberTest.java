package com.im.listener;

import com.im.config.ImNodeIdentity;
import com.im.dto.WsPushEvent;
import com.im.metrics.ImServerMetrics;
import com.im.service.WsPushEventDispatcher;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.redisson.api.listener.MessageListener;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WsPushTopicSubscriberTest {

    private RedissonClient redissonClient;
    private WsPushEventDispatcher dispatcher;
    private ImNodeIdentity nodeIdentity;
    private RTopic topic;
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        redissonClient = mock(RedissonClient.class);
        dispatcher = mock(WsPushEventDispatcher.class);
        nodeIdentity = mock(ImNodeIdentity.class);
        topic = mock(RTopic.class);
        meterRegistry = new SimpleMeterRegistry();

        when(nodeIdentity.getInstanceId()).thenReturn("node-1");
        when(redissonClient.getTopic("im:channel:node-1")).thenReturn(topic);
        when(topic.addListener(eq(WsPushEvent.class), any())).thenReturn(7);
    }

    @Test
    void listener_shouldOnlySubmitTaskAndNotDispatchInline() {
        CapturingExecutor executor = new CapturingExecutor();
        WsPushTopicSubscriber subscriber = subscriber(executor);
        WsPushEvent event = event("evt-1");

        subscriber.subscribe();
        captureListener().onMessage("im:channel:node-1", event);

        assertEquals(1, executor.tasks.size());
        verify(dispatcher, never()).dispatchEvent(any());
        assertEquals(1.0, listenerCount("success", "accepted"));

        executor.tasks.get(0).run();
        verify(dispatcher).dispatchEvent(event);
    }

    @Test
    void listener_shouldDispatchInSubmittedTask() {
        WsPushTopicSubscriber subscriber = subscriber(Runnable::run);
        WsPushEvent event = event("evt-2");

        subscriber.subscribe();
        captureListener().onMessage("im:channel:node-1", event);

        verify(dispatcher).dispatchEvent(event);
    }

    @Test
    void listener_shouldSwallowDispatchException() {
        WsPushTopicSubscriber subscriber = subscriber(Runnable::run);
        WsPushEvent event = event("evt-3");
        org.mockito.Mockito.doThrow(new RuntimeException("boom")).when(dispatcher).dispatchEvent(event);

        subscriber.subscribe();

        assertDoesNotThrow(() -> captureListener().onMessage("im:channel:node-1", event));
        verify(dispatcher).dispatchEvent(event);
        assertEquals(1.0, listenerCount("success", "accepted"));
        assertEquals(1.0, listenerCount("failure", "dispatch_failed"));
    }

    @Test
    void listener_shouldSwallowExecutorRejection() {
        Executor rejectingExecutor = command -> {
            throw new RejectedExecutionException("full");
        };
        WsPushTopicSubscriber subscriber = subscriber(rejectingExecutor);
        WsPushEvent event = event("evt-4");

        subscriber.subscribe();

        assertDoesNotThrow(() -> captureListener().onMessage("im:channel:node-1", event));
        verify(dispatcher, never()).dispatchEvent(any());
        assertEquals(1.0, listenerCount("failure", "executor_rejected"));
    }

    private WsPushTopicSubscriber subscriber(Executor executor) {
        WsPushTopicSubscriber subscriber = new WsPushTopicSubscriber(redissonClient, dispatcher, nodeIdentity, executor);
        ReflectionTestUtils.setField(subscriber, "channelPrefix", "im:channel:");
        ReflectionTestUtils.setField(subscriber, "metrics", new ImServerMetrics(meterRegistry));
        return subscriber;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private MessageListener<WsPushEvent> captureListener() {
        org.mockito.ArgumentCaptor<MessageListener> captor = org.mockito.ArgumentCaptor.forClass(MessageListener.class);
        verify(topic).addListener(eq(WsPushEvent.class), captor.capture());
        return captor.getValue();
    }

    private WsPushEvent event(String eventId) {
        return WsPushEvent.builder()
                .eventId(eventId)
                .build();
    }

    private double listenerCount(String result, String reason) {
        return meterRegistry.counter("im.websocket.listener.submit.total", "result", result, "reason", reason).count();
    }

    private static class CapturingExecutor implements Executor {
        private final List<Runnable> tasks = new ArrayList<>();

        @Override
        public void execute(Runnable command) {
            tasks.add(command);
        }
    }
}
