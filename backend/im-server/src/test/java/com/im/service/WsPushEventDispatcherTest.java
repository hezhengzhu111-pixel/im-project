package com.im.service;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.dto.WsPushEvent;
import com.im.entity.UserSession;
import com.im.metrics.ImServerMetrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WsPushEventDispatcherTest {

    @Mock
    private IImService imService;

    @Mock
    private ProcessedMessageDeduplicator deduplicator;

    @Mock
    private MessageRetryQueue retryQueue;

    @InjectMocks
    private WsPushEventDispatcher dispatcher;

    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        ReflectionTestUtils.setField(dispatcher, "metrics", new ImServerMetrics(meterRegistry));
    }

    @Test
    void dispatchEvent_shouldFanOutMessageToAllLocalSessions() {
        UserSession sessionA = session("session-a");
        UserSession sessionB = session("session-b");
        WsPushEvent event = WsPushEvent.builder()
                .eventId("evt-1")
                .eventType("MESSAGE")
                .messageId(100L)
                .targetUserIds(List.of(2L))
                .payload(JSON.toJSONString(new MessageDTO()))
                .build();
        when(imService.getLocalSessions("2")).thenReturn(List.of(sessionA, sessionB));
        when(deduplicator.isProcessed("evt-1:2:session-a")).thenReturn(false);
        when(deduplicator.isProcessed("evt-1:2:session-b")).thenReturn(false);
        when(imService.isSessionActive("2", "session-a")).thenReturn(true);
        when(imService.isSessionActive("2", "session-b")).thenReturn(true);
        when(imService.pushMessageToSession(any(MessageDTO.class), eq("session-a"))).thenReturn(true);
        when(imService.pushMessageToSession(any(MessageDTO.class), eq("session-b"))).thenReturn(true);

        dispatcher.dispatchEvent(event);

        verify(imService).pushMessageToSession(any(MessageDTO.class), eq("session-a"));
        verify(imService).pushMessageToSession(any(MessageDTO.class), eq("session-b"));
        verify(deduplicator).markProcessed("evt-1:2:session-a");
        verify(deduplicator).markProcessed("evt-1:2:session-b");
    }

    @Test
    void dispatchEvent_shouldSkipAlreadyProcessedSessionDelivery() {
        UserSession sessionA = session("session-a");
        WsPushEvent event = WsPushEvent.builder()
                .eventId("evt-dup")
                .eventType("MESSAGE")
                .targetUserIds(List.of(2L))
                .payload(JSON.toJSONString(new MessageDTO()))
                .build();
        when(imService.getLocalSessions("2")).thenReturn(List.of(sessionA));
        when(deduplicator.isProcessed("evt-dup:2:session-a")).thenReturn(true);

        dispatcher.dispatchEvent(event);

        verify(imService, never()).pushMessageToSession(any(), any());
        verify(retryQueue, never()).enqueue(any(), any(), any(), any());
    }

    @Test
    void dispatchEvent_shouldRetryOnlyFailedSession() {
        UserSession sessionA = session("session-a");
        WsPushEvent event = WsPushEvent.builder()
                .eventId("evt-fail")
                .eventType("MESSAGE")
                .messageId(101L)
                .targetUserIds(List.of(2L))
                .payload(JSON.toJSONString(new MessageDTO()))
                .build();
        when(imService.getLocalSessions("2")).thenReturn(List.of(sessionA));
        when(deduplicator.isProcessed("evt-fail:2:session-a")).thenReturn(false);
        when(imService.isSessionActive("2", "session-a")).thenReturn(true);
        when(imService.pushMessageToSession(any(MessageDTO.class), eq("session-a"))).thenReturn(false);

        dispatcher.dispatchEvent(event);

        verify(retryQueue).enqueue(eq("2"), eq("session-a"), any(WsPushEvent.class), eq("ws_push_failed"));
        verify(deduplicator, never()).markProcessed("evt-fail:2:session-a");
    }

    @Test
    void dispatchEvent_shouldPushReadReceiptBySession() {
        UserSession sessionA = session("session-a");
        ReadReceiptDTO receiptDTO = ReadReceiptDTO.builder()
                .toUserId(2L)
                .lastReadMessageId(200L)
                .build();
        WsPushEvent event = WsPushEvent.builder()
                .eventId("evt-rr")
                .eventType("READ_RECEIPT")
                .messageId(200L)
                .targetUserIds(List.of(2L))
                .payload(JSON.toJSONString(receiptDTO))
                .build();
        when(imService.getLocalSessions("2")).thenReturn(List.of(sessionA));
        when(deduplicator.isProcessed("evt-rr:2:session-a")).thenReturn(false);
        when(imService.isSessionActive("2", "session-a")).thenReturn(true);
        when(imService.pushReadReceiptToSession(any(ReadReceiptDTO.class), eq("session-a"), eq("READ_RECEIPT"))).thenReturn(true);

        dispatcher.dispatchEvent(event);

        verify(imService).pushReadReceiptToSession(any(ReadReceiptDTO.class), eq("session-a"), eq("READ_RECEIPT"));
        verify(deduplicator).markProcessed("evt-rr:2:session-a");
        assertEquals(1.0, dispatchCount("success", "session"));
    }

    @Test
    void dispatchRaw_shouldIgnoreInvalidJson() {
        assertDoesNotThrow(() -> dispatcher.dispatchRaw("{invalid_json"));

        verifyNoInteractions(imService, deduplicator, retryQueue);
        assertEquals(1.0, dispatchCount("failure", "raw_json"));
    }

    @Test
    void dispatchEvent_shouldIgnoreInvalidPayload() {
        WsPushEvent event = WsPushEvent.builder()
                .eventId("evt-bad-payload")
                .eventType("MESSAGE")
                .targetUserIds(List.of(2L))
                .payload("{invalid_json")
                .build();

        assertDoesNotThrow(() -> dispatcher.dispatchEvent(event));

        verifyNoInteractions(imService, deduplicator, retryQueue);
        assertEquals(1.0, dispatchCount("failure", "payload_json"));
    }

    @Test
    void dispatchEvent_shouldContinueWhenOneSessionThrows() {
        UserSession sessionA = session("session-a");
        UserSession sessionB = session("session-b");
        WsPushEvent event = WsPushEvent.builder()
                .eventId("evt-partial-fail")
                .eventType("MESSAGE")
                .targetUserIds(List.of(2L))
                .payload(JSON.toJSONString(new MessageDTO()))
                .build();
        when(imService.getLocalSessions("2")).thenReturn(List.of(sessionA, sessionB));
        when(deduplicator.isProcessed("evt-partial-fail:2:session-a")).thenReturn(false);
        when(deduplicator.isProcessed("evt-partial-fail:2:session-b")).thenReturn(false);
        when(imService.isSessionActive("2", "session-a")).thenReturn(true);
        when(imService.isSessionActive("2", "session-b")).thenReturn(true);
        doThrow(new RuntimeException("boom")).when(imService)
                .pushMessageToSession(any(MessageDTO.class), eq("session-a"));
        when(imService.pushMessageToSession(any(MessageDTO.class), eq("session-b"))).thenReturn(true);

        assertDoesNotThrow(() -> dispatcher.dispatchEvent(event));

        verify(imService).pushMessageToSession(any(MessageDTO.class), eq("session-a"));
        verify(imService).pushMessageToSession(any(MessageDTO.class), eq("session-b"));
        verify(deduplicator, never()).markProcessed("evt-partial-fail:2:session-a");
        verify(deduplicator).markProcessed("evt-partial-fail:2:session-b");
        assertEquals(1.0, dispatchCount("failure", "dispatch_session"));
        assertEquals(1.0, dispatchCount("success", "session"));
    }

    @Test
    void dispatchEvent_shouldIgnoreNullOrEmptyTargets() {
        assertDoesNotThrow(() -> dispatcher.dispatchEvent(null));
        assertDoesNotThrow(() -> dispatcher.dispatchEvent(WsPushEvent.builder()
                .eventId("evt-empty-target")
                .targetUserIds(List.of())
                .payload(JSON.toJSONString(new MessageDTO()))
                .build()));

        verifyNoInteractions(imService, deduplicator, retryQueue);
        assertEquals(1.0, dispatchCount("failure", "event_null"));
        assertEquals(1.0, dispatchCount("failure", "target_users_empty"));
    }

    private double dispatchCount(String result, String stage) {
        return meterRegistry.counter("im.websocket.dispatch.total", "result", result, "stage", stage).count();
    }

    private UserSession session(String sessionId) {
        WebSocketSession webSocketSession = org.mockito.Mockito.mock(WebSocketSession.class);
        when(webSocketSession.getId()).thenReturn(sessionId);
        return UserSession.builder().webSocketSession(webSocketSession).build();
    }
}
