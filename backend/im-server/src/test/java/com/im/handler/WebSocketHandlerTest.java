package com.im.handler;

import com.im.entity.UserSession;
import com.im.enums.UserStatus;
import com.im.service.IImService;
import com.im.service.RouteSessionInfo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WebSocketHandlerTest {

    @Mock
    private IImService imService;

    @Mock
    private WsMessageDispatcher dispatcher;

    @Mock
    private RedissonClient redissonClient;

    @Mock
    private RLock registrationLock;

    @InjectMocks
    private WebSocketHandler handler;

    @Mock
    private WebSocketSession session;

    private Map<String, Object> attributes;

    @BeforeEach
    void setUp() throws Exception {
        attributes = new HashMap<>();
        lenient().when(redissonClient.getLock(anyString())).thenReturn(registrationLock);
        lenient().when(registrationLock.tryLock(anyLong(), anyLong(), eq(TimeUnit.SECONDS))).thenReturn(true);
        lenient().when(registrationLock.isHeldByCurrentThread()).thenReturn(true);
        lenient().when(imService.getCurrentInstanceId()).thenReturn("im-node-1");
        lenient().when(imService.getRouteSessionInfo(anyString())).thenReturn(null);
        lenient().when(session.getId()).thenReturn("new-session");
    }

    @Test
    void afterConnectionEstablished_NoUserId_ShouldCloseSession() throws Exception {
        when(session.getAttributes()).thenReturn(attributes);

        handler.afterConnectionEstablished(session);
        
        ArgumentCaptor<CloseStatus> statusCaptor = ArgumentCaptor.forClass(CloseStatus.class);
        verify(session).close(statusCaptor.capture());
        assertEquals(CloseStatus.BAD_DATA.getCode(), statusCaptor.getValue().getCode());
        verify(redissonClient, never()).getLock(anyString());
    }

    @Test
    void afterConnectionEstablished_ShouldNotFallbackToUriUserId() throws Exception {
        when(session.getAttributes()).thenReturn(attributes);

        handler.afterConnectionEstablished(session);

        verify(session).close(any(CloseStatus.class));
        verify(imService, never()).putSessionMapping(any(), any(UserSession.class));
        verify(redissonClient, never()).getLock(anyString());
    }

    @Test
    void afterConnectionEstablished_ValidUserId_ShouldRegisterSession() throws Exception {
        attributes.put("userId", "123");
        when(session.getAttributes()).thenReturn(attributes);
        
        Map<String, UserSession> sessionMap = new HashMap<>();
        when(imService.getSessionUserMap()).thenReturn(sessionMap);

        handler.afterConnectionEstablished(session);

        verify(redissonClient).getLock("ws:reg:123");
        verify(imService).putSessionMapping(eq("123"), any(UserSession.class));
        verify(registrationLock).unlock();
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
        when(imService.getRouteSessionInfo("123")).thenReturn(new RouteSessionInfo("im-node-1", "old-session"));
        doAnswer(invocation -> {
            String userId = invocation.getArgument(0);
            UserSession newSession = invocation.getArgument(1);
            sessionMap.put(userId, newSession);
            return null;
        }).when(imService).putSessionMapping(eq("123"), any(UserSession.class));

        handler.afterConnectionEstablished(session);

        ArgumentCaptor<CloseStatus> statusCaptor = ArgumentCaptor.forClass(CloseStatus.class);
        verify(oldSession).close(statusCaptor.capture());
        assertEquals("新连接建立", statusCaptor.getValue().getReason());
        verify(imService).putSessionMapping(eq("123"), any(UserSession.class));
        verify(imService, never()).publishSessionKickout(anyString(), anyString(), anyString(), anyString());
        assertSame(session, sessionMap.get("123").getWebSocketSession());
    }

    @Test
    void afterConnectionEstablished_RemoteSession_ShouldPublishKickoutEvent() throws Exception {
        attributes.put("userId", "123");
        when(session.getAttributes()).thenReturn(attributes);
        when(imService.getSessionUserMap()).thenReturn(new HashMap<>());
        when(imService.getRouteSessionInfo("123")).thenReturn(new RouteSessionInfo("im-node-2", "remote-session"));

        handler.afterConnectionEstablished(session);

        verify(imService).putSessionMapping(eq("123"), any(UserSession.class));
        verify(imService).publishSessionKickout("im-node-2", "123", "remote-session", "新连接建立");
    }

    @Test
    void afterConnectionEstablished_WhenLockBusy_ShouldRejectCurrentSession() throws Exception {
        attributes.put("userId", "123");
        when(session.getAttributes()).thenReturn(attributes);
        when(session.isOpen()).thenReturn(true);
        when(registrationLock.tryLock(anyLong(), anyLong(), eq(TimeUnit.SECONDS))).thenReturn(false);

        handler.afterConnectionEstablished(session);

        verify(session).close(argThat(status ->
                status != null
                        && status.getCode() == CloseStatus.SERVER_ERROR.getCode()
                        && String.valueOf(status.getReason()).contains("会话注册冲突")));
        verify(imService, never()).putSessionMapping(anyString(), any(UserSession.class));
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
        userSession.setWebSocketSession(session);
        sessionMap.put("123", userSession);
        when(imService.getSessionUserMap()).thenReturn(sessionMap);
        
        WebSocketMessage<?> message = new TextMessage("ping");
        handler.handleMessage(session, message);
        
        verify(dispatcher).dispatch(session, "123", "ping");
        verify(imService).refreshRouteHeartbeat("123", "new-session");
    }

    @Test
    void handleMessage_StaleSession_ShouldIgnore() {
        attributes.put("userId", "123");
        when(session.getAttributes()).thenReturn(attributes);

        Map<String, UserSession> sessionMap = new HashMap<>();
        UserSession currentSession = new UserSession();
        WebSocketSession activeSession = mock(WebSocketSession.class);
        currentSession.setWebSocketSession(activeSession);
        sessionMap.put("123", currentSession);
        when(imService.getSessionUserMap()).thenReturn(sessionMap);

        handler.handleMessage(session, new TextMessage("ping"));

        verify(dispatcher, never()).dispatch(any(), any(), any());
        verify(imService, never()).refreshRouteHeartbeat(anyString(), anyString());
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
