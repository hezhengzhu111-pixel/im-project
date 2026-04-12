package com.im.service;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.dto.WsPushEvent;
import com.im.entity.UserSession;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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
        when(imService.pushReadReceiptToSession(any(ReadReceiptDTO.class), eq("session-a"))).thenReturn(true);

        dispatcher.dispatchEvent(event);

        verify(imService).pushReadReceiptToSession(any(ReadReceiptDTO.class), eq("session-a"));
        verify(deduplicator).markProcessed("evt-rr:2:session-a");
    }

    private UserSession session(String sessionId) {
        WebSocketSession webSocketSession = org.mockito.Mockito.mock(WebSocketSession.class);
        when(webSocketSession.getId()).thenReturn(sessionId);
        return UserSession.builder().webSocketSession(webSocketSession).build();
    }
}
