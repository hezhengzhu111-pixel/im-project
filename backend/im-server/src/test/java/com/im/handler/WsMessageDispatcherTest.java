package com.im.handler;

import com.alibaba.fastjson2.JSONObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayList;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WsMessageDispatcherTest {

    private WsMessageDispatcher dispatcher;

    @Mock
    private WsMessageHandler mockHandler1;

    @Mock
    private WsMessageHandler mockHandler2;

    @Mock
    private WebSocketSession session;

    @BeforeEach
    void setUp() {
        List<WsMessageHandler> handlers = new ArrayList<>();
        handlers.add(mockHandler1);
        handlers.add(mockHandler2);
        dispatcher = new WsMessageDispatcher(handlers);
    }

    @Test
    void dispatch_NullOrBlankPayload_ShouldReturn() {
        dispatcher.dispatch(session, "123", null);
        dispatcher.dispatch(session, "123", "   ");
        verify(mockHandler1, never()).handle(any(), any(), any());
        verify(mockHandler2, never()).handle(any(), any(), any());
    }

    @Test
    void dispatch_PingMessage_ShouldDispatchToHeartbeatHandler() {
        when(mockHandler1.supports("HEARTBEAT")).thenReturn(true);
        
        dispatcher.dispatch(session, "123", "ping");
        
        verify(mockHandler1).handle(session, "123", null);
        verify(mockHandler2, never()).handle(any(), any(), any());
    }

    @Test
    void dispatch_JsonMessage_ShouldParseAndDispatch() {
        when(mockHandler1.supports("CHAT")).thenReturn(false);
        when(mockHandler2.supports("CHAT")).thenReturn(true);
        
        String payload = "{\"type\":\"CHAT\",\"content\":\"hello\"}";
        dispatcher.dispatch(session, "123", payload);
        
        verify(mockHandler1, never()).handle(any(), any(), any());
        verify(mockHandler2).handle(eq(session), eq("123"), any(JSONObject.class));
    }

    @Test
    void dispatch_InvalidJson_ShouldCatchExceptionAndReturn() {
        String payload = "{invalid_json";
        dispatcher.dispatch(session, "123", payload);
        
        verify(mockHandler1, never()).handle(any(), any(), any());
        verify(mockHandler2, never()).handle(any(), any(), any());
    }

    @Test
    void dispatch_NoMatchingHandler_ShouldReturn() {
        when(mockHandler1.supports("UNKNOWN_TYPE")).thenReturn(false);
        when(mockHandler2.supports("UNKNOWN_TYPE")).thenReturn(false);
        
        String payload = "{\"type\":\"UNKNOWN_TYPE\"}";
        dispatcher.dispatch(session, "123", payload);
        
        verify(mockHandler1, never()).handle(any(), any(), any());
        verify(mockHandler2, never()).handle(any(), any(), any());
    }
}
