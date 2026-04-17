package com.im.handler;

import com.im.entity.UserSession;
import com.im.service.IImService;
import com.im.websocket.WebSocketErrorSemantics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WebSocketHandlerTest {

    @Mock
    private IImService imService;

    @Mock
    private WsMessageDispatcher dispatcher;

    @InjectMocks
    private WebSocketHandler handler;

    @Mock
    private WebSocketSession session;

    private Map<String, Object> attributes;

    @BeforeEach
    void setUp() {
        attributes = new HashMap<>();
        when(session.getAttributes()).thenReturn(attributes);
        when(session.getId()).thenReturn("session-1");
    }

    @Test
    void afterConnectionEstablished_shouldRejectMissingUserId() throws Exception {
        handler.afterConnectionEstablished(session);

        verify(session).close(argThat(status -> status.getCode() == CloseStatus.BAD_DATA.getCode()));
        verify(imService, never()).registerSession(any(), any());
    }

    @Test
    void afterConnectionEstablished_shouldRegisterSessionWithoutKickout() throws Exception {
        attributes.put("userId", "123");

        handler.afterConnectionEstablished(session);

        ArgumentCaptor<UserSession> captor = ArgumentCaptor.forClass(UserSession.class);
        verify(imService).registerSession(eq("123"), captor.capture());
        assertEquals("123", captor.getValue().getUserId());
        WebSocketSession registeredSession = captor.getValue().getWebSocketSession();
        assertInstanceOf(ConcurrentWebSocketSessionDecorator.class, registeredSession);
        assertNotSame(session, registeredSession);
        assertEquals("session-1", registeredSession.getId());
    }

    @Test
    void handleMessage_shouldDispatchForActiveSession() {
        attributes.put("userId", "123");
        WebSocketSession registeredSession = mock(WebSocketSession.class);
        when(imService.isSessionActive("123", "session-1")).thenReturn(true);
        when(imService.getSession("session-1"))
                .thenReturn(UserSession.builder().webSocketSession(registeredSession).build());

        handler.handleMessage(session, new TextMessage("ping"));

        verify(imService).refreshRouteHeartbeat("123", "session-1");
        verify(dispatcher).dispatch(registeredSession, "123", "ping");
    }

    @Test
    void handleMessage_shouldIgnoreStaleSession() {
        attributes.put("userId", "123");
        when(imService.isSessionActive("123", "session-1")).thenReturn(false);

        handler.handleMessage(session, new TextMessage("ping"));

        verify(dispatcher, never()).dispatch(any(), any(), any());
        verify(imService, never()).refreshRouteHeartbeat(any(), any());
        verify(imService).unregisterSession(eq("123"), eq("session-1"),
                argThat(status -> status.getCode() == CloseStatus.SESSION_NOT_RELIABLE.getCode()
                        && WebSocketErrorSemantics.SESSION_ERROR_CODE.equals(status.getReason())));
    }

    @Test
    void handleTransportError_shouldUnregisterSession() {
        attributes.put("userId", "123");

        handler.handleTransportError(session, new RuntimeException("boom"));

        verify(imService).unregisterSession(eq("123"), eq("session-1"),
                argThat(status -> status.getCode() == CloseStatus.SESSION_NOT_RELIABLE.getCode()
                        && WebSocketErrorSemantics.SESSION_ERROR_CODE.equals(status.getReason())));
    }

    @Test
    void afterConnectionClosed_shouldUnregisterSessionWithCloseStatus() throws Exception {
        attributes.put("userId", "123");

        handler.afterConnectionClosed(session, CloseStatus.NORMAL);

        verify(imService).unregisterSession("123", "session-1", CloseStatus.NORMAL);
    }
}
