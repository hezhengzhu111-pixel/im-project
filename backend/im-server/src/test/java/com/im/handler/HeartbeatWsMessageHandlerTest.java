package com.im.handler;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class HeartbeatWsMessageHandlerTest {

    private final HeartbeatWsMessageHandler handler = new HeartbeatWsMessageHandler();

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
    }
}
