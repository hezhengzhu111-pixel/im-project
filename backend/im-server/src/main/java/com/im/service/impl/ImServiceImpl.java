package com.im.service.impl;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.entity.UserSession;
import com.im.enums.UserStatus;
import com.im.service.IImService;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
@Slf4j
@Service
public class ImServiceImpl implements IImService {
    private static final Duration HEARTBEAT_TIMEOUT = Duration.ofMinutes(5);

    private final Map<String, UserSession> sessionUserMap = new ConcurrentHashMap<>();

    @Override
    public Map<String, Boolean> checkUsersOnlineStatus(List<String> userIds) {
        Map<String, Boolean> userStatusMap = new HashMap<>();
        if (userIds == null || userIds.isEmpty()) {
            return userStatusMap;
        }
        for (String rawUserId : userIds) {
            if (StringUtils.isBlank(rawUserId)) {
                continue;
            }
            String userId = rawUserId.trim();
            UserSession userSession = sessionUserMap.get(userId);
            boolean online = isSessionOnline(userId, userSession);
            userStatusMap.put(userId, online);
        }
        return userStatusMap;
    }

    @Override
    public boolean touchUserHeartbeat(String userId) {
        if (StringUtils.isBlank(userId)) {
            return false;
        }
        String normalizedUserId = userId.trim();
        UserSession userSession = sessionUserMap.get(normalizedUserId);
        if (userSession == null) {
            return false;
        }
        if (!isSessionOpenAndFresh(userSession, LocalDateTime.now())) {
            userOffline(normalizedUserId);
            return false;
        }
        userSession.setStatus(UserStatus.ONLINE);
        userSession.setLastHeartbeat(LocalDateTime.now());
        return true;
    }

    @Override
    public boolean userOffline(String userId) {
        try {
            if (StringUtils.isBlank(userId)) {
                return false;
            }
            String normalizedUserId = userId.trim();
            UserSession removedSession = sessionUserMap.remove(normalizedUserId);
            if (removedSession != null) {
                WebSocketSession webSocketSession = removedSession.getWebSocketSession();
                if (webSocketSession != null && webSocketSession.isOpen()) {
                    try {
                        webSocketSession.close();
                    } catch (Exception closeError) {
                        log.debug("关闭离线用户会话失败: userId={}", normalizedUserId, closeError);
                    }
                }
                LocalDateTime connectTime = removedSession.getConnectTime();
                if (connectTime != null) {
                    log.debug("清理用户会话信息: userId={}, 会话时长={}分钟",
                            normalizedUserId,
                            Duration.between(connectTime, LocalDateTime.now()).toMinutes());
                }
            }
            broadcastOnlineStatus(normalizedUserId, UserStatus.OFFLINE);
            return true;
        } catch (Exception e) {
            log.error("用户下线处理异常: userId={}", userId, e);
            return false;
        }
    }


    @Override
    public void sendPrivateMessage(MessageDTO message) {
        log.debug("im-server 收到私聊消息发送请求 (应由 Listener 处理): {}", message);
    }

    @Override
    public void sendGroupMessage(MessageDTO message) {
        log.debug("im-server 收到群聊消息发送请求 (应由 Listener 处理): {}", message);
    }

    @Override
    public Map<String, UserSession> getSessionUserMap() {
        return sessionUserMap;
    }

    @Override
    public void putSessionMapping(String key, UserSession userSession) {
        if (StringUtils.isBlank(key) || userSession == null) {
            return;
        }
        String normalizedUserId = key.trim();
        userSession.setUserId(normalizedUserId);
        userSession.setStatus(UserStatus.ONLINE);
        userSession.setLastHeartbeat(LocalDateTime.now());
        sessionUserMap.put(normalizedUserId, userSession);
        broadcastOnlineStatus(normalizedUserId, UserStatus.ONLINE);
    }

    @Override
    public boolean removeSessionMapping(String key) {
        return sessionUserMap.remove(key) != null;
    }


    private boolean isSessionOnline(String userId, UserSession userSession) {
        if (StringUtils.isBlank(userId) || userSession == null) {
            return false;
        }
        boolean online = isSessionOpenAndFresh(userSession, LocalDateTime.now());
        if (!online) {
            userOffline(userId);
        }
        return online;
    }

    private boolean isSessionOpenAndFresh(UserSession userSession, LocalDateTime now) {
        if (userSession.getStatus() != UserStatus.ONLINE) {
            return false;
        }
        if (userSession.getWebSocketSession() == null || !userSession.getWebSocketSession().isOpen()) {
            return false;
        }
        LocalDateTime lastHeartbeat = userSession.getLastHeartbeat();
        if (lastHeartbeat == null) {
            return false;
        }
        return !lastHeartbeat.isBefore(now.minus(HEARTBEAT_TIMEOUT));
    }

    private void broadcastOnlineStatus(String userId, UserStatus status) {
        Map<String, Object> data = new HashMap<>();
        data.put("userId", userId);
        data.put("status", status == UserStatus.ONLINE ? "ONLINE" : "OFFLINE");
        data.put("lastSeen", LocalDateTime.now().toString());

        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "ONLINE_STATUS");
        payload.put("data", data);
        payload.put("timestamp", System.currentTimeMillis());
        String text = JSON.toJSONString(payload);

        for (UserSession session : sessionUserMap.values()) {
            if (session == null) {
                continue;
            }
            WebSocketSession webSocketSession = session.getWebSocketSession();
            if (webSocketSession == null || !webSocketSession.isOpen()) {
                continue;
            }
            try {
                webSocketSession.sendMessage(new TextMessage(text));
            } catch (Exception e) {
                log.debug("广播在线状态失败: targetUserId={}", session.getUserId(), e);
            }
        }
    }
}
