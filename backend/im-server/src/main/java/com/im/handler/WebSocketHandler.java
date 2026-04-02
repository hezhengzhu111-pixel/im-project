package com.im.handler;

import com.im.entity.UserSession;
import com.im.enums.UserStatus;
import com.im.service.IImService;
import com.im.service.RouteSessionInfo;

import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;

import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
public class WebSocketHandler implements org.springframework.web.socket.WebSocketHandler {

    private static final long SESSION_REGISTRATION_LOCK_WAIT_SECONDS = 2L;
    private static final long SESSION_REGISTRATION_LOCK_LEASE_SECONDS = 10L;
    private static final String SESSION_REPLACED_REASON = "新连接建立";

    @Autowired
    private IImService imService;

    @Autowired
    private RedissonClient redissonClient;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String userId = extractUserIdFromSession(session);
        if (StringUtils.isBlank(userId)) {
            log.warn("WebSocket连接失败: 用户ID无效, session={}", session.getId());
            session.close(CloseStatus.BAD_DATA.withReason("用户ID无效"));
            return;
        }

        UserSession userSession = UserSession.builder()
                .userId(userId)
                .status(UserStatus.ONLINE)
                .connectTime(LocalDateTime.now())
                .lastHeartbeat(LocalDateTime.now())
                .webSocketSession(session)
                .build();

        RLock registrationLock = redissonClient.getLock(buildSessionRegistrationLockKey(userId));
        boolean locked = false;
        try {
            locked = registrationLock.tryLock(
                    SESSION_REGISTRATION_LOCK_WAIT_SECONDS,
                    SESSION_REGISTRATION_LOCK_LEASE_SECONDS,
                    TimeUnit.SECONDS
            );
            if (!locked) {
                log.warn("WebSocket连接失败: 会话注册锁获取超时, userId={}, sessionId={}", userId, session.getId());
                closeSessionQuietly(session, CloseStatus.SERVER_ERROR.withReason("会话注册冲突，请重试"));
                return;
            }

            RouteSessionInfo existingRoute = imService.getRouteSessionInfo(userId);
            WebSocketSession replacedSession = resolveLocalReplacedSession(userId, session);
            imService.putSessionMapping(userId, userSession);
            if (replacedSession != null) {
                closeSessionQuietly(replacedSession, CloseStatus.NORMAL.withReason(SESSION_REPLACED_REASON));
            }
            if (shouldKickRemoteSession(existingRoute)) {
                imService.publishSessionKickout(
                        existingRoute.getInstanceId(),
                        userId,
                        existingRoute.getSessionId(),
                        SESSION_REPLACED_REASON
                );
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("WebSocket连接失败: 会话注册被中断, userId={}, sessionId={}", userId, session.getId(), e);
            closeSessionQuietly(session, CloseStatus.SERVER_ERROR.withReason("会话注册被中断，请重试"));
            return;
        } catch (Exception e) {
            log.error("WebSocket连接失败: 会话注册异常, userId={}, sessionId={}", userId, session.getId(), e);
            closeSessionQuietly(session, CloseStatus.SERVER_ERROR.withReason("会话注册失败，请重试"));
            return;
        } finally {
            if (locked && registrationLock.isHeldByCurrentThread()) {
                registrationLock.unlock();
            }
        }
        log.debug("WebSocket连接建立: userId={}, sessionId={}", userId, session.getId());
    }
    
    @Autowired
    private WsMessageDispatcher dispatcher;

    @Override
    public void handleMessage(WebSocketSession session, WebSocketMessage<?> message) {
        String userId = extractUserIdFromSession(session);
        if (userId == null) {
            log.warn("无法提取用户ID: session={}", session.getId());
            return;
        }

        UserSession userSession = imService.getSessionUserMap().get(userId);
        if (userSession == null || userSession.getWebSocketSession() != session) {
            log.debug("用户会话不存在: userId={}", userId);
            return;
        }

        String payload = message.getPayload() == null ? "" : message.getPayload().toString().trim();
        imService.refreshRouteHeartbeat(userId, session.getId());

        dispatcher.dispatch(session, userId, payload);
    }
    
    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        String userId = extractUserIdFromSession(session);
        log.error("WebSocket传输错误: userId={}, error={}", userId, exception.getMessage());
        cleanupSession(session);
    }
    
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus) throws Exception {
        String userId = extractUserIdFromSession(session);
        log.debug("WebSocket连接关闭: userId={}, closeStatus={}", userId, closeStatus);
        cleanupSession(session);
    }
    
    /**
     * 是否支持部分消息
     * 返回false表示不支持部分消息传输，必须接收完整消息
     * 
     * @return false - 不支持部分消息
     */
    @Override
    public boolean supportsPartialMessages() {
        return false;
    }

    private WebSocketSession resolveLocalReplacedSession(String userId, WebSocketSession currentSession) {
        UserSession existingSession = imService.getSessionUserMap().get(userId);
        if (existingSession == null || existingSession.getWebSocketSession() == null) {
            return null;
        }
        WebSocketSession existingWebSocketSession = existingSession.getWebSocketSession();
        if (existingWebSocketSession == currentSession || !existingWebSocketSession.isOpen()) {
            return null;
        }
        return existingWebSocketSession;
    }

    private boolean shouldKickRemoteSession(RouteSessionInfo routeSessionInfo) {
        return routeSessionInfo != null
                && StringUtils.isNotBlank(routeSessionInfo.getInstanceId())
                && StringUtils.isNotBlank(routeSessionInfo.getSessionId())
                && !StringUtils.equals(routeSessionInfo.getInstanceId(), imService.getCurrentInstanceId());
    }

    private String buildSessionRegistrationLockKey(String userId) {
        return "ws:reg:" + userId;
    }

    private String extractUserIdFromSession(WebSocketSession session) {
        if (session == null) {
            return null;
        }
        Object userIdAttr = session.getAttributes().get("userId");
        if (userIdAttr == null) {
            return null;
        }
        // FIX: 只信任握手拦截器写入的 userId，禁止从 URI 降级提取，避免越权伪造。
        String userId = userIdAttr.toString().trim();
        return StringUtils.isBlank(userId) ? null : userId;
    }

    private void cleanupSession(WebSocketSession session) {
        if (session == null) {
            return;
        }
        
        String userId = extractUserIdFromSession(session);
        if (userId != null) {
            UserSession userSession = imService.getSessionUserMap().get(userId);
            if (userSession != null && userSession.getWebSocketSession() == session) {
                imService.userOffline(userId);
                log.debug("WebSocket连接已清理: userId={}", userId);
            }
        }
    }

    private void closeSessionQuietly(WebSocketSession session, CloseStatus status) {
        if (session == null || !session.isOpen()) {
            return;
        }
        try {
            session.close(status);
        } catch (Exception e) {
            log.debug("关闭WebSocket连接失败: sessionId={}", session.getId(), e);
        }
    }
}
