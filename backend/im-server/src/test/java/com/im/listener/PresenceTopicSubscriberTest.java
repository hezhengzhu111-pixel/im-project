package com.im.listener;

import com.im.config.ImNodeIdentity;
import com.im.dto.PresenceEvent;
import com.im.enums.UserStatus;
import com.im.service.IImService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.redisson.api.listener.MessageListener;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PresenceTopicSubscriberTest {

    private RedissonClient redissonClient;
    private IImService imService;
    private ImNodeIdentity nodeIdentity;
    private RTopic topic;

    @BeforeEach
    void setUp() {
        redissonClient = mock(RedissonClient.class);
        imService = mock(IImService.class);
        nodeIdentity = mock(ImNodeIdentity.class);
        topic = mock(RTopic.class);

        when(nodeIdentity.getInstanceId()).thenReturn("node-1");
        when(redissonClient.getTopic("im:presence:broadcast")).thenReturn(topic);
        when(topic.addListener(eq(PresenceEvent.class), any())).thenReturn(8);
    }

    @Test
    void listener_shouldBroadcastRemotePresenceToLocalSessions() {
        PresenceTopicSubscriber subscriber = subscriber();
        PresenceEvent event = event("2", "ONLINE", "node-2");

        subscriber.subscribe();
        captureListener().onMessage("im:presence:broadcast", event);

        verify(imService).broadcastOnlineStatus("2", UserStatus.ONLINE, event.getLastSeen());
    }

    @Test
    void listener_shouldIgnoreOwnPresenceEvent() {
        PresenceTopicSubscriber subscriber = subscriber();

        subscriber.subscribe();
        captureListener().onMessage("im:presence:broadcast", event("2", "ONLINE", "node-1"));

        verify(imService, never()).broadcastOnlineStatus(any(), any(), any());
    }

    @Test
    void listener_shouldSwallowInvalidPresenceEvent() {
        PresenceTopicSubscriber subscriber = subscriber();

        subscriber.subscribe();

        assertDoesNotThrow(() -> captureListener().onMessage(
                "im:presence:broadcast",
                event("2", "BROKEN", "node-2")));
        verify(imService, never()).broadcastOnlineStatus(any(), any(), any());
    }

    private PresenceTopicSubscriber subscriber() {
        PresenceTopicSubscriber subscriber = new PresenceTopicSubscriber(redissonClient, imService, nodeIdentity);
        ReflectionTestUtils.setField(subscriber, "presenceChannel", "im:presence:broadcast");
        return subscriber;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private MessageListener<PresenceEvent> captureListener() {
        org.mockito.ArgumentCaptor<MessageListener> captor = org.mockito.ArgumentCaptor.forClass(MessageListener.class);
        verify(topic).addListener(eq(PresenceEvent.class), captor.capture());
        return captor.getValue();
    }

    private PresenceEvent event(String userId, String status, String sourceInstanceId) {
        return PresenceEvent.builder()
                .userId(userId)
                .status(status)
                .lastSeen("2026-04-14T10:00:00")
                .sourceInstanceId(sourceInstanceId)
                .build();
    }
}
