package com.im.service.impl;

import com.alibaba.fastjson2.JSON;
import com.im.dto.GroupMemberDTO;
import com.im.dto.MessageDTO;
import com.im.entity.UserSession;
import com.im.enums.MessageType;
import com.im.enums.UserStatus;
import com.im.service.RouteSessionInfo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ImServiceImplTest {

    @Mock
    private StringRedisTemplate stringRedisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @InjectMocks
    private ImServiceImpl imService;

    @BeforeEach
    void setUp() {
        lenient().when(stringRedisTemplate.opsForValue()).thenReturn(valueOperations);
        ReflectionTestUtils.setField(imService, "routeUserKeyPrefix", "im:route:user:");
        ReflectionTestUtils.setField(imService, "routeSessionKeyPrefix", "im:route:session:");
        ReflectionTestUtils.setField(imService, "wsChannelPrefix", "im:ws:push:");
        ReflectionTestUtils.setField(imService, "instanceId", "im-node-1");
    }

    @Test
    void checkUsersOnlineStatus_EmptyList_ShouldReturnEmptyMap() {
        Map<String, Boolean> result = imService.checkUsersOnlineStatus(null);
        assertTrue(result.isEmpty());
    }

    @Test
    void checkUsersOnlineStatus_ValidList_ShouldReturnStatus() {
        when(stringRedisTemplate.hasKey("im:route:user:1")).thenReturn(true);
        when(stringRedisTemplate.hasKey("im:route:user:2")).thenReturn(false);

        Map<String, Boolean> result = imService.checkUsersOnlineStatus(Arrays.asList("1", "2", " ", null));

        assertEquals(2, result.size());
        assertTrue(result.get("1"));
        assertFalse(result.get("2"));
    }

    @Test
    void touchUserHeartbeat_UserNotExists_ShouldReturnFalse() {
        assertFalse(imService.touchUserHeartbeat("1"));
    }

    @Test
    void touchUserHeartbeat_UserExists_ShouldUpdateAndReturnTrue() {
        UserSession session = new UserSession();
        WebSocketSession wsSession = mock(WebSocketSession.class);
        when(wsSession.isOpen()).thenReturn(true);
        when(wsSession.getId()).thenReturn("session-1");
        session.setWebSocketSession(wsSession);
        session.setLastHeartbeat(LocalDateTime.now());
        session.setStatus(UserStatus.ONLINE);
        
        imService.getSessionUserMap().put("1", session);

        assertTrue(imService.touchUserHeartbeat("1"));
        verify(valueOperations).set(eq("im:route:user:1"), eq(imService.getInstanceId()), any(Duration.class));
        verify(valueOperations).set(eq("im:route:session:1"), anyString(), any(Duration.class));
    }

    @Test
    void userOffline_ShouldRemoveSessionAndRedisKey() throws Exception {
        UserSession session = new UserSession();
        WebSocketSession wsSession = mock(WebSocketSession.class);
        when(wsSession.isOpen()).thenReturn(true);
        session.setWebSocketSession(wsSession);
        
        imService.getSessionUserMap().put("1", session);
        
        when(valueOperations.get("im:route:user:1")).thenReturn(imService.getInstanceId());

        assertTrue(imService.userOffline("1"));

        assertNull(imService.getSessionUserMap().get("1"));
        verify(stringRedisTemplate).delete("im:route:user:1");
        verify(stringRedisTemplate).delete("im:route:session:1");
        verify(wsSession).close();
    }

    @Test
    void sendPrivateMessage_UserOnline_ShouldSendMessage() throws Exception {
        UserSession session = new UserSession();
        WebSocketSession wsSession = mock(WebSocketSession.class);
        when(wsSession.isOpen()).thenReturn(true);
        session.setWebSocketSession(wsSession);
        
        imService.getSessionUserMap().put("2", session);

        MessageDTO message = new MessageDTO();
        message.setReceiverId(2L);
        message.setMessageType(MessageType.TEXT);

        imService.sendPrivateMessage(message);

        verify(wsSession).sendMessage(any(TextMessage.class));
    }

    @Test
    void sendPrivateMessage_SystemMessage_ShouldSendSystemType() throws Exception {
        UserSession session = new UserSession();
        WebSocketSession wsSession = mock(WebSocketSession.class);
        when(wsSession.isOpen()).thenReturn(true);
        session.setWebSocketSession(wsSession);
        
        imService.getSessionUserMap().put("2", session);

        MessageDTO message = new MessageDTO();
        message.setReceiverId(2L);
        message.setMessageType(MessageType.SYSTEM);

        imService.sendPrivateMessage(message);

        verify(wsSession).sendMessage(argThat(msg -> {
            String payload = ((TextMessage) msg).getPayload();
            return payload.contains("\"type\":\"SYSTEM\"");
        }));
    }

    @Test
    void sendGroupMessage_ShouldPushToOtherMembers() throws Exception {
        UserSession session2 = new UserSession();
        WebSocketSession wsSession2 = mock(WebSocketSession.class);
        when(wsSession2.isOpen()).thenReturn(true);
        session2.setWebSocketSession(wsSession2);
        
        imService.getSessionUserMap().put("2", session2);

        MessageDTO message = new MessageDTO();
        message.setSenderId(1L);
        
        GroupMemberDTO m1 = new GroupMemberDTO();
        m1.setUserId(1L); // Sender
        
        GroupMemberDTO m2 = new GroupMemberDTO();
        m2.setUserId(2L); // Receiver
        
        message.setGroupMembers(Arrays.asList(m1, m2));

        imService.sendGroupMessage(message);

        verify(wsSession2).sendMessage(any(TextMessage.class));
    }

    @Test
    void putSessionMapping_ShouldAddToMapAndRedis() {
        UserSession session = new UserSession();
        WebSocketSession wsSession = mock(WebSocketSession.class);
        when(wsSession.getId()).thenReturn("session-1");
        session.setWebSocketSession(wsSession);
        imService.putSessionMapping("1", session);

        assertEquals(session, imService.getSessionUserMap().get("1"));
        verify(valueOperations).set(eq("im:route:user:1"), eq(imService.getInstanceId()), any(Duration.class));
        verify(valueOperations).set(eq("im:route:session:1"), anyString(), any(Duration.class));
    }

    @Test
    void removeSessionMapping_ShouldRemoveFromMapAndRedis() {
        imService.getSessionUserMap().put("1", new UserSession());
        when(valueOperations.get("im:route:user:1")).thenReturn(imService.getInstanceId());

        assertTrue(imService.removeSessionMapping("1"));

        assertNull(imService.getSessionUserMap().get("1"));
        verify(stringRedisTemplate).delete("im:route:user:1");
        verify(stringRedisTemplate).delete("im:route:session:1");
    }

    @Test
    void refreshRouteHeartbeat_ShouldRefreshSessionAndRedisRoute() {
        UserSession session = new UserSession();
        session.setStatus(UserStatus.OFFLINE);
        WebSocketSession wsSession = mock(WebSocketSession.class);
        when(wsSession.getId()).thenReturn("session-1");
        session.setWebSocketSession(wsSession);
        imService.getSessionUserMap().put("1", session);

        imService.refreshRouteHeartbeat("1", "session-1");

        assertEquals(UserStatus.ONLINE, session.getStatus());
        assertNotNull(session.getLastHeartbeat());
        verify(valueOperations).set(eq("im:route:user:1"), eq(imService.getInstanceId()), any(Duration.class));
        verify(valueOperations).set(eq("im:route:session:1"), anyString(), any(Duration.class));
    }

    @Test
    void refreshRouteHeartbeat_ShouldIgnoreStaleSessionId() {
        UserSession session = new UserSession();
        WebSocketSession wsSession = mock(WebSocketSession.class);
        when(wsSession.getId()).thenReturn("active-session");
        session.setWebSocketSession(wsSession);
        imService.getSessionUserMap().put("1", session);

        imService.refreshRouteHeartbeat("1", "stale-session");

        verify(valueOperations, never()).set(eq("im:route:user:1"), eq(imService.getInstanceId()), any(Duration.class));
    }

    @Test
    void getRouteSessionInfo_ShouldReadSessionMetadata() {
        when(valueOperations.get("im:route:session:1"))
                .thenReturn(JSON.toJSONString(new RouteSessionInfo("im-node-2", "session-2")));

        RouteSessionInfo info = imService.getRouteSessionInfo("1");

        assertNotNull(info);
        assertEquals("im-node-2", info.getInstanceId());
        assertEquals("session-2", info.getSessionId());
    }

    @Test
    void publishSessionKickout_ShouldSendToTargetInstanceChannel() {
        imService.publishSessionKickout("im-node-2", "1", "session-2", "新连接建立");

        verify(stringRedisTemplate).convertAndSend(eq("im:ws:push:im-node-2"), contains("\"eventType\":\"SESSION_KICKOUT\""));
    }

    @Test
    void disconnectLocalSessionIfMatch_ShouldIgnoreStaleSessionId() throws Exception {
        UserSession session = new UserSession();
        WebSocketSession wsSession = mock(WebSocketSession.class);
        when(wsSession.getId()).thenReturn("active-session");
        session.setWebSocketSession(wsSession);
        imService.getSessionUserMap().put("1", session);

        assertFalse(imService.disconnectLocalSessionIfMatch("1", "stale-session", "新连接建立"));

        assertSame(session, imService.getSessionUserMap().get("1"));
        verify(wsSession, never()).close(any(org.springframework.web.socket.CloseStatus.class));
    }
}
