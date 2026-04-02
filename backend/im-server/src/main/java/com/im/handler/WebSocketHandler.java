package com.im.handler;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.im.constants.ImConstants;
import com.im.entity.UserSession;
import com.im.enums.UserStatus;
import com.im.service.IImService;

import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
public class WebSocketHandler implements org.springframework.web.socket.WebSocketHandler {

    // FIX: 使用固定条带锁按 userId 串行化注册流程，避免并发建连时相互覆盖映射。
    private static final int SESSION_REGISTRATION_LOCK_STRIPES = 256;

    @Autowired
    private IImService imService;

    // FIX: 预分配固定数量锁对象，避免按 userId 动态建锁造成长期内存膨胀。
    private final Object[] sessionRegistrationLocks = initSessionRegistrationLocks();

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

        WebSocketSession replacedSession = null;
        synchronized (resolveSessionRegistrationLock(userId)) {
            UserSession existingSession = imService.getSessionUserMap().get(userId);
            if (existingSession != null && existingSession.getWebSocketSession() != null) {
                WebSocketSession existingWebSocketSession = existingSession.getWebSocketSession();
                if (existingWebSocketSession != session && existingWebSocketSession.isOpen()) {
                    // FIX: 先在同一 userId 的串行临界区内确定待替换旧连接，避免并发连接互相覆盖。
                    replacedSession = existingWebSocketSession;
                }
            }
            // FIX: 同一 userId 的注册过程串行化，确保映射最终只保留最新连接。
            imService.putSessionMapping(userId, userSession);
        }

        if (replacedSession != null) {
            try {
                // FIX: 新连接注册完成后再关闭旧连接，避免旧连接仍作为当前映射残留。
                replacedSession.close(CloseStatus.NORMAL.withReason("新连接建立"));
            } catch (Exception e) {
                log.debug("关闭旧连接失败: userId={}", userId, e);
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
        if (userSession == null) {
            log.debug("用户会话不存在: userId={}", userId);
            return;
        }

        String payload = message.getPayload() == null ? "" : message.getPayload().toString().trim();
        imService.refreshRouteHeartbeat(userId);

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

    private Object[] initSessionRegistrationLocks() {
        Object[] locks = new Object[SESSION_REGISTRATION_LOCK_STRIPES];
        for (int i = 0; i < locks.length; i++) {
            locks[i] = new Object();
        }
        return locks;
    }

    private Object resolveSessionRegistrationLock(String userId) {
        int index = Math.floorMod(userId.hashCode(), SESSION_REGISTRATION_LOCK_STRIPES);
        return sessionRegistrationLocks[index];
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
}
