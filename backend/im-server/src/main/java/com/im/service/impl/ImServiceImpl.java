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

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class ImServiceImpl implements IImService {
    private static final Duration HEARTBEAT_TIMEOUT = Duration.ofMinutes(5);
    private static final String ROUTE_KEY_PREFIX = "im:route:user:";

    private final String instanceId = UUID.randomUUID().toString();
    private final Map<String, UserSession> sessionUserMap = new ConcurrentHashMap<>();

    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    public String getInstanceId() {
        return instanceId;
    }

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
            Boolean hasKey = stringRedisTemplate.hasKey(ROUTE_KEY_PREFIX + userId);
            userStatusMap.put(userId, Boolean.TRUE.equals(hasKey));
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
        // 更新 Redis 中的心跳 TTL
        stringRedisTemplate.expire(ROUTE_KEY_PREFIX + normalizedUserId, HEARTBEAT_TIMEOUT);
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
            
            // 从 Redis 中移除路由信息 (如果是当前实例)
            String routeInstanceId = stringRedisTemplate.opsForValue().get(ROUTE_KEY_PREFIX + normalizedUserId);
            if (instanceId.equals(routeInstanceId)) {
                stringRedisTemplate.delete(ROUTE_KEY_PREFIX + normalizedUserId);
            }

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
        if (message.getMessageType() == com.im.enums.MessageType.SYSTEM) {
            pushToUser(message, message.getReceiverId());
            return;
        }
        pushToUser(message, message.getReceiverId());
    }

    @Override
    public void sendGroupMessage(MessageDTO message) {
        if (message.getGroupMembers() == null) {
            return;
        }
        for (com.im.dto.GroupMemberDTO member : message.getGroupMembers()) {
            if (member == null || member.getUserId() == null) {
                continue;
            }
            if (member.getUserId().equals(message.getSenderId())) {
                continue;
            }
            pushToUser(message, member.getUserId());
        }
    }

    private void pushToUser(MessageDTO message, Long userId) {
        if (userId == null) return;
        String userIdStr = userId.toString();
        
        UserSession userSession = sessionUserMap.get(userIdStr);
        if (userSession == null || userSession.getWebSocketSession() == null || !userSession.getWebSocketSession().isOpen()) {
            log.debug("用户 {} 不在线或连接断开，消息未推送", userIdStr);
            return;
        }
        
        Map<String, Object> wsMessage = new HashMap<>();
        if (message.getMessageType() == com.im.enums.MessageType.SYSTEM) {
            wsMessage.put("type", "SYSTEM");
        } else {
            wsMessage.put("type", "MESSAGE");
        }
        wsMessage.put("data", message);
        wsMessage.put("timestamp", System.currentTimeMillis());
        
        String textMessage = JSON.toJSONString(wsMessage, com.alibaba.fastjson2.JSONWriter.Feature.WriteLongAsString);

        try {
            userSession.getWebSocketSession().sendMessage(new TextMessage(textMessage));
            log.debug("消息已推送给用户: {} -> {}", message.getSenderId(), userIdStr);
        } catch (Exception e) {
            log.error("推送消息失败: {}", e.getMessage(), e);
        }
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
        
        // 写入 Redis
        stringRedisTemplate.opsForValue().set(ROUTE_KEY_PREFIX + normalizedUserId, instanceId, HEARTBEAT_TIMEOUT);

        broadcastOnlineStatus(normalizedUserId, UserStatus.ONLINE);
    }

    @Override
    public boolean removeSessionMapping(String key) {
        boolean removed = sessionUserMap.remove(key) != null;
        if (removed) {
            String routeInstanceId = stringRedisTemplate.opsForValue().get(ROUTE_KEY_PREFIX + key);
            if (instanceId.equals(routeInstanceId)) {
                stringRedisTemplate.delete(ROUTE_KEY_PREFIX + key);
            }
        }
        return removed;
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

    public void pushReadReceipt(com.im.dto.ReadReceiptDTO receipt) {
        Long userId = receipt.getToUserId();
        if (userId == null) return;
        String userIdStr = userId.toString();
        UserSession userSession = sessionUserMap.get(userIdStr);

        if (userSession == null || userSession.getWebSocketSession() == null || !userSession.getWebSocketSession().isOpen()) {
            return;
        }

        Map<String, Object> wsMessage = new HashMap<>();
        wsMessage.put("type", "READ_RECEIPT");
        wsMessage.put("data", receipt);
        wsMessage.put("timestamp", System.currentTimeMillis());

        String textMessage = JSON.toJSONString(wsMessage, com.alibaba.fastjson2.JSONWriter.Feature.WriteLongAsString);

        try {
            userSession.getWebSocketSession().sendMessage(new TextMessage(textMessage));
        } catch (Exception e) {
            log.error("推送已读回执失败: {}", e.getMessage(), e);
        }
    }
}
