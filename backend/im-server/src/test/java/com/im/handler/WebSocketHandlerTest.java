package com.im.handler;

import com.im.entity.UserSession;
import com.im.enums.UserStatus;
import com.im.service.IImService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
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
    }

    @Test
    void afterConnectionEstablished_NoUserId_ShouldCloseSession() throws Exception {
        when(session.getAttributes()).thenReturn(attributes);
        
        handler.afterConnectionEstablished(session);
        
        ArgumentCaptor<CloseStatus> statusCaptor = ArgumentCaptor.forClass(CloseStatus.class);
        verify(session).close(statusCaptor.capture());
        assertEquals(CloseStatus.BAD_DATA.getCode(), statusCaptor.getValue().getCode());
    }

    @Test
    void afterConnectionEstablished_ValidUserId_ShouldRegisterSession() throws Exception {
        attributes.put("userId", "123");
        when(session.getAttributes()).thenReturn(attributes);
        
        Map<String, UserSession> sessionMap = new HashMap<>();
        when(imService.getSessionUserMap()).thenReturn(sessionMap);
        
        handler.afterConnectionEstablished(session);
        
        verify(imService).putSessionMapping(eq("123"), any(UserSession.class));
    }

    @Test
    void afterConnectionEstablished_ExistingSession_ShouldKickOut() throws Exception {
        attributes.put("userId", "123");
        when(session.getAttributes()).thenReturn(attributes);
        
        Map<String, UserSession> sessionMap = new HashMap<>();
        UserSession existingUserSession = new UserSession();
        WebSocketSession oldSession = mock(WebSocketSession.class);
        when(oldSession.isOpen()).thenReturn(true);
        existingUserSession.setWebSocketSession(oldSession);
        sessionMap.put("123", existingUserSession);
        
        when(imService.getSessionUserMap()).thenReturn(sessionMap);
        
        handler.afterConnectionEstablished(session);
        
        ArgumentCaptor<CloseStatus> statusCaptor = ArgumentCaptor.forClass(CloseStatus.class);
        verify(oldSession).close(statusCaptor.capture());
        assertEquals("新连接建立", statusCaptor.getValue().getReason());
        verify(imService).putSessionMapping(eq("123"), any(UserSession.class));
    }

    @Test
    void handleMessage_NoUserId_ShouldReturn() {
        when(session.getAttributes()).thenReturn(attributes);
        WebSocketMessage<?> message = new TextMessage("test");
        
        handler.handleMessage(session, message);
        
        verify(dispatcher, never()).dispatch(any(), any(), any());
    }

    @Test
    void handleMessage_ValidUserIdAndSession_ShouldDispatch() {
        attributes.put("userId", "123");
        when(session.getAttributes()).thenReturn(attributes);
        
        Map<String, UserSession> sessionMap = new HashMap<>();
        UserSession userSession = new UserSession();
        sessionMap.put("123", userSession);
        when(imService.getSessionUserMap()).thenReturn(sessionMap);
        
        WebSocketMessage<?> message = new TextMessage("ping");
        handler.handleMessage(session, message);
        
        verify(dispatcher).dispatch(session, "123", "ping");
        assertNotNull(userSession.getLastHeartbeat());
    }

    @Test
    void handleTransportError_ShouldCleanup() {
        attributes.put("userId", "123");
        when(session.getAttributes()).thenReturn(attributes);
        
        Map<String, UserSession> sessionMap = new HashMap<>();
        UserSession userSession = new UserSession();
        userSession.setWebSocketSession(session);
        sessionMap.put("123", userSession);
        when(imService.getSessionUserMap()).thenReturn(sessionMap);
        
        handler.handleTransportError(session, new RuntimeException("error"));
        
        verify(imService).userOffline("123");
    }

    @Test
    void afterConnectionClosed_ShouldCleanup() throws Exception {
        attributes.put("userId", "123");
        when(session.getAttributes()).thenReturn(attributes);
        
        Map<String, UserSession> sessionMap = new HashMap<>();
        UserSession userSession = new UserSession();
        userSession.setWebSocketSession(session);
        sessionMap.put("123", userSession);
        when(imService.getSessionUserMap()).thenReturn(sessionMap);
        
        handler.afterConnectionClosed(session, CloseStatus.NORMAL);
        
        verify(imService).userOffline("123");
    }
}
