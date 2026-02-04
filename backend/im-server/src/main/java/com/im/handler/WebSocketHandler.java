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
    
    @Autowired
    private IImService imService;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String userId = extractUserIdFromSession(session);
        if (StringUtils.isBlank(userId)) {
            log.warn("WebSocket连接失败: 用户ID无效, session={}", session.getId());
            session.close(CloseStatus.BAD_DATA.withReason("用户ID无效"));
            return;
        }

        UserSession existingSession = imService.getSessionUserMap().get(userId);
        if (existingSession != null && existingSession.getWebSocketSession() != null && existingSession.getWebSocketSession().isOpen()) {
            try {
                existingSession.getWebSocketSession().close(CloseStatus.NORMAL.withReason("新连接建立"));
            } catch (Exception e) {
                log.debug("关闭旧连接失败: userId={}", userId, e);
            }
        }

        UserSession userSession = UserSession.builder()
                .userId(userId)
                .status(UserStatus.ONLINE)
                .connectTime(LocalDateTime.now())
                .lastHeartbeat(LocalDateTime.now())
                .webSocketSession(session)
                .build();

        imService.putSessionMapping(userId, userSession);
        log.debug("WebSocket连接建立: userId={}, sessionId={}", userId, session.getId());
    }
    
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
        userSession.setLastHeartbeat(LocalDateTime.now());

        if (isHeartbeat(payload)) {
            handleHeartbeat(session, userId);
        }
    }
    
    private boolean isHeartbeat(String payload) {
        if ("PING".equals(payload) || ImConstants.Heartbeat.PING_MESSAGE.equals(payload)) {
            return true;
        }
        if (payload != null && payload.startsWith("{") && payload.endsWith("}")) {
            try {
                JSONObject json = JSON.parseObject(payload);
                return "HEARTBEAT".equals(json.getString("type"));
            } catch (Exception ignored) {
                return false;
            }
        }
        return false;
    }

    private void handleHeartbeat(WebSocketSession session, String userId) {
        try {
            if (session.isOpen()) {
                Map<String, String> response = new HashMap<>();
                response.put("type", "HEARTBEAT");
                response.put("content", "PONG");
                session.sendMessage(new TextMessage(JSON.toJSONString(response)));
            } else {
                log.warn("会话已关闭，无法发送心跳响应: userId={}", userId);
                cleanupSession(session);
            }
        } catch (Exception e) {
            log.error("发送心跳响应失败: userId={}", userId, e);
        }
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
    
    private String extractUserIdFromSession(WebSocketSession session) {
        if (session == null) {
            return null;
        }
        // 优先从Attribute中获取
        Object userIdAttr = session.getAttributes().get("userId");
        if (userIdAttr != null) {
            return userIdAttr.toString();
        }
        
        // 降级：尝试从URI获取
        if (session.getUri() == null) {
            return null;
        }
        String path = session.getUri().getPath();
        if (path != null && path.startsWith("/websocket/")) {
            return path.substring("/websocket/".length());
        }
        return null;
    }
    private void cleanupSession(WebSocketSession session) {
        if (session == null) {
            return;
        }
        
        String userId = extractUserIdFromSession(session);
        if (userId != null) {
            UserSession userSession = imService.getSessionUserMap().get(userId);
            if (userSession != null && userSession.getWebSocketSession() == session) {
                imService.removeSessionMapping(userId);
                imService.userOffline(userId);
                log.debug("WebSocket连接已清理: userId={}", userId);
            }
        }
    }
}
