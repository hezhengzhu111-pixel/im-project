package com.im.handler;

import com.im.service.IImService;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class HeartbeatWsMessageHandlerTest {

    private final IImService imService = mock(IImService.class);
    private final HeartbeatWsMessageHandler handler = new HeartbeatWsMessageHandler(imService);

    @Test
    void supports_HeartbeatType_ShouldReturnTrue() {
        assertTrue(handler.supports("HEARTBEAT"));
    }

    @Test
    void supports_OtherType_ShouldReturnFalse() {
        assertFalse(handler.supports("CHAT"));
    }

    @Test
    void handle_ShouldSendPongMessage() throws Exception {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.isOpen()).thenReturn(true);
        
        handler.handle(session, "123", null);
        
        verify(session).sendMessage(any(TextMessage.class));
        verify(imService, never()).unregisterSession(any(), any(), any());
    }

    @Test
    void handle_shouldUnregisterOnlyCurrentSessionWhenSendFails() throws Exception {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.isOpen()).thenReturn(true);
        when(session.getId()).thenReturn("session-1");
        doThrow(new IllegalStateException("send busy")).when(session).sendMessage(any(TextMessage.class));

        assertDoesNotThrow(() -> handler.handle(session, "123", null));

        verify(imService).unregisterSession(eq("123"), eq("session-1"),
                argThat(status -> status.getCode() == CloseStatus.SESSION_NOT_RELIABLE.getCode()
                        && "send failed".equals(status.getReason())));
    }
}
