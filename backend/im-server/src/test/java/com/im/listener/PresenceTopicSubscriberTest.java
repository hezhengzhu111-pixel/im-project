package com.im.listener;

import com.im.config.ImNodeIdentity;
import com.im.dto.PresenceEvent;
import com.im.enums.UserStatus;
import com.im.service.IImService;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.redisson.api.listener.MessageListener;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class PresenceTopicSubscriberTest {

    private RedissonClient redissonClient;
    private IImService imService;
    private ImNodeIdentity nodeIdentity;
    private RTopic topic;
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        redissonClient = mock(RedissonClient.class);
        imService = mock(IImService.class);
        nodeIdentity = mock(ImNodeIdentity.class);
        topic = mock(RTopic.class);
        meterRegistry = new SimpleMeterRegistry();

        when(nodeIdentity.getInstanceId()).thenReturn("node-1");
        when(redissonClient.getTopic("im:presence:broadcast")).thenReturn(topic);
        when(topic.addListener(eq(PresenceEvent.class), any())).thenReturn(8);
    }

    @Test
    void listener_shouldBroadcastRemotePresenceToLocalSessions() {
        PresenceTopicSubscriber subscriber = subscriber(new MutableClock(Instant.parse("2026-04-17T10:00:00Z")), 5_000L);
        PresenceEvent event = event("2", "ONLINE", "node-2", 1_000L, "2026-04-14T10:00:00");

        subscriber.subscribe();
        captureListener().onMessage("im:presence:broadcast", event);

        verify(imService).broadcastOnlineStatus("2", UserStatus.ONLINE, event.getLastSeen());
    }

    @Test
    void listener_shouldIgnoreOwnPresenceEvent() {
        PresenceTopicSubscriber subscriber = subscriber(new MutableClock(Instant.parse("2026-04-17T10:00:00Z")), 5_000L);

        subscriber.subscribe();
        captureListener().onMessage("im:presence:broadcast", event("2", "ONLINE", "node-1", 1_000L, "2026-04-14T10:00:00"));

        verify(imService, never()).broadcastOnlineStatus(any(), any(), any());
    }

    @Test
    void listener_shouldSwallowInvalidPresenceEvent() {
        PresenceTopicSubscriber subscriber = subscriber(new MutableClock(Instant.parse("2026-04-17T10:00:00Z")), 5_000L);

        subscriber.subscribe();

        assertDoesNotThrow(() -> captureListener().onMessage(
                "im:presence:broadcast",
                event("2", "BROKEN", "node-2", 1_000L, "2026-04-14T10:00:00")));
        verify(imService, never()).broadcastOnlineStatus(any(), any(), any());
    }

    @Test
    void listener_shouldDeliverSameStatusWhenVersionIsHigher() {
        PresenceTopicSubscriber subscriber = subscriber(new MutableClock(Instant.parse("2026-04-17T10:00:00Z")), 5_000L);

        subscriber.subscribe();
        captureListener().onMessage("im:presence:broadcast",
                event("2", "ONLINE", "node-2", 100L, "2026-04-14T10:00:00"));
        captureListener().onMessage("im:presence:broadcast",
                event("2", "ONLINE", "node-2", 101L, "2026-04-14T10:00:01"));

        verify(imService).broadcastOnlineStatus("2", UserStatus.ONLINE, "2026-04-14T10:00:00");
        verify(imService).broadcastOnlineStatus("2", UserStatus.ONLINE, "2026-04-14T10:00:01");
    }

    @Test
    void listener_shouldIgnoreOlderVersionEvent() {
        PresenceTopicSubscriber subscriber = subscriber(new MutableClock(Instant.parse("2026-04-17T10:00:00Z")), 5_000L);

        subscriber.subscribe();
        captureListener().onMessage("im:presence:broadcast",
                event("2", "ONLINE", "node-2", 200L, "2026-04-14T10:00:02"));
        captureListener().onMessage("im:presence:broadcast",
                event("2", "OFFLINE", "node-2", 199L, "2026-04-14T10:00:01"));

        verify(imService).broadcastOnlineStatus("2", UserStatus.ONLINE, "2026-04-14T10:00:02");
        verifyNoMoreInteractions(imService);
    }

    @Test
    void listener_shouldCleanupExpiredCacheEntriesAfterTtl() {
        MutableClock clock = new MutableClock(Instant.parse("2026-04-17T10:00:00Z"));
        PresenceTopicSubscriber subscriber = subscriber(clock, 100L);

        subscriber.subscribe();
        captureListener().onMessage("im:presence:broadcast",
                event("2", "ONLINE", "node-2", 100L, "2026-04-14T10:00:00"));

        assertEquals(1.0D, cacheGaugeValue(), 0.001D);

        clock.advanceMillis(101L);

        assertEquals(0.0D, cacheGaugeValue(), 0.001D);
    }

    @Test
    void listener_shouldRecoverFromMissingIntermediateStateWhenLaterVersionArrives() {
        PresenceTopicSubscriber subscriber = subscriber(new MutableClock(Instant.parse("2026-04-17T10:00:00Z")), 5_000L);

        subscriber.subscribe();
        captureListener().onMessage("im:presence:broadcast",
                event("2", "ONLINE", "node-2", 300L, "2026-04-14T10:00:00"));
        captureListener().onMessage("im:presence:broadcast",
                event("2", "ONLINE", "node-2", 302L, "2026-04-14T10:00:02"));

        verify(imService).broadcastOnlineStatus("2", UserStatus.ONLINE, "2026-04-14T10:00:00");
        verify(imService).broadcastOnlineStatus("2", UserStatus.ONLINE, "2026-04-14T10:00:02");
    }

    @Test
    void unsubscribe_shouldClearCacheReference() {
        PresenceTopicSubscriber subscriber = subscriber(new MutableClock(Instant.parse("2026-04-17T10:00:00Z")), 5_000L);

        subscriber.subscribe();
        captureListener().onMessage("im:presence:broadcast",
                event("2", "ONLINE", "node-2", 100L, "2026-04-14T10:00:00"));

        assertEquals(1.0D, cacheGaugeValue(), 0.001D);
        subscriber.unsubscribe();

        assertNull(ReflectionTestUtils.getField(subscriber, "lastDeliveredStatuses"));
        assertEquals(0.0D, cacheGaugeValue(), 0.001D);
        verify(topic).removeListener(8);
    }

    private PresenceTopicSubscriber subscriber(MutableClock clock, long ttlMillis) {
        PresenceTopicSubscriber subscriber = new PresenceTopicSubscriber(redissonClient, imService, nodeIdentity);
        ReflectionTestUtils.setField(subscriber, "presenceChannel", "im:presence:broadcast");
        ReflectionTestUtils.setField(subscriber, "presenceDeliveryCacheTtlMs", ttlMillis);
        ReflectionTestUtils.setField(subscriber, "meterRegistry", meterRegistry);
        ReflectionTestUtils.setField(subscriber, "clock", clock);
        return subscriber;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private MessageListener<PresenceEvent> captureListener() {
        org.mockito.ArgumentCaptor<MessageListener> captor = org.mockito.ArgumentCaptor.forClass(MessageListener.class);
        verify(topic, times(1)).addListener(eq(PresenceEvent.class), captor.capture());
        return captor.getValue();
    }

    private double cacheGaugeValue() {
        Gauge gauge = meterRegistry.find("im.websocket.presence.delivery.cache.size").gauge();
        assertNotNull(gauge);
        return gauge.value();
    }

    private PresenceEvent event(String userId,
                                String status,
                                String sourceInstanceId,
                                long eventTime,
                                String lastSeen) {
        return PresenceEvent.builder()
                .userId(userId)
                .status(status)
                .lastSeen(lastSeen)
                .eventTime(eventTime)
                .sourceInstanceId(sourceInstanceId)
                .build();
    }

    private static final class MutableClock extends Clock {
        private Instant currentInstant;
        private final ZoneId zoneId;

        private MutableClock(Instant currentInstant) {
            this(currentInstant, ZoneId.of("UTC"));
        }

        private MutableClock(Instant currentInstant, ZoneId zoneId) {
            this.currentInstant = currentInstant;
            this.zoneId = zoneId;
        }

        @Override
        public ZoneId getZone() {
            return zoneId;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return new MutableClock(currentInstant, zone);
        }

        @Override
        public Instant instant() {
            return currentInstant;
        }

        private void advanceMillis(long millis) {
            currentInstant = currentInstant.plusMillis(millis);
        }
    }
}
