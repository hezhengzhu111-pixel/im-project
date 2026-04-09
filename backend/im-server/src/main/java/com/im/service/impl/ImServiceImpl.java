package com.im.service.impl;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.dto.WsPushEvent;
import com.im.entity.UserSession;
import com.im.enums.MessageType;
import com.im.enums.UserStatus;
import com.im.service.IImService;
import com.im.service.RouteSessionInfo;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
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
    private static final String EVENT_TYPE_SESSION_KICKOUT = "SESSION_KICKOUT";
    private static final int WS_PUSH_EVENT_VERSION = 1;
    private final Map<String, UserSession> sessionUserMap = new ConcurrentHashMap<>();

    @Value("${im.route.user-key-prefix:im:route:user:}")
    private String routeUserKeyPrefix;

    @Value("${im.route.session-key-prefix:im:route:session:}")
    private String routeSessionKeyPrefix;

    @Value("${im.ws.channel-prefix:im:ws:push:}")
    private String wsChannelPrefix;

    @Value("${im.instance-id:${HOSTNAME:${spring.application.name:im-server}}}")
    private String instanceId;

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
            Boolean hasKey = stringRedisTemplate.hasKey(routeKey(userId));
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
        storeRouteState(normalizedUserId, resolveSessionId(userSession));
        return true;
    }

    @Override
    public void refreshRouteHeartbeat(String userId, String sessionId) {
        if (StringUtils.isBlank(userId) || StringUtils.isBlank(sessionId)) {
            return;
        }
        String normalizedUserId = userId.trim();
        UserSession userSession = sessionUserMap.get(normalizedUserId);
        if (userSession == null) {
            return;
        }
        String currentSessionId = resolveSessionId(userSession);
        if (!sessionId.trim().equals(currentSessionId)) {
            return;
        }
        userSession.setLastHeartbeat(LocalDateTime.now());
        userSession.setStatus(UserStatus.ONLINE);
        storeRouteState(normalizedUserId, currentSessionId);
    }

    @Override
    public boolean userOffline(String userId) {
        try {
            if (StringUtils.isBlank(userId)) {
                return false;
            }
            String normalizedUserId = userId.trim();
            UserSession removedSession = sessionUserMap.remove(normalizedUserId);

            if (isRouteOwnedByCurrentInstance(normalizedUserId)) {
                stringRedisTemplate.delete(routeKey(normalizedUserId));
                stringRedisTemplate.delete(routeSessionKey(normalizedUserId));
            }

            if (removedSession != null) {
                closeSessionQuietly(normalizedUserId, removedSession.getWebSocketSession());
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
        pushMessageToUser(message, message == null ? null : message.getReceiverId());
    }

    @Override
    public void sendGroupMessage(MessageDTO message) {
        if (message == null || message.getGroupMembers() == null) {
            return;
        }
        for (com.im.dto.GroupMemberDTO member : message.getGroupMembers()) {
            if (member == null || member.getUserId() == null || member.getUserId().equals(message.getSenderId())) {
                continue;
            }
            pushMessageToUser(message, member.getUserId());
        }
    }

    @Override
    public boolean pushMessageToUser(MessageDTO message, Long userId) {
        if (message == null || userId == null) {
            return false;
        }
        String wsType = message.getMessageType() == MessageType.SYSTEM ? "SYSTEM" : "MESSAGE";
        boolean success = pushPayloadToUser(userId, wsType, message);
        logPushMessageResult(message, userId, success);
        return success;
    }

    @Override
    public boolean pushReadReceiptToUser(ReadReceiptDTO receipt, Long userId) {
        if (receipt == null || userId == null) {
            return false;
        }
        return pushPayloadToUser(userId, "READ_RECEIPT", receipt);
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
        storeRouteState(normalizedUserId, resolveSessionId(userSession));
        broadcastOnlineStatus(normalizedUserId, UserStatus.ONLINE);
    }

    @Override
    public boolean removeSessionMapping(String key) {
        if (StringUtils.isBlank(key)) {
            return false;
        }
        String normalizedUserId = key.trim();
        boolean removed = sessionUserMap.remove(normalizedUserId) != null;
        if (removed && isRouteOwnedByCurrentInstance(normalizedUserId)) {
            stringRedisTemplate.delete(routeKey(normalizedUserId));
            stringRedisTemplate.delete(routeSessionKey(normalizedUserId));
        }
        return removed;
    }

    @Override
    public boolean hasLocalSession(String userId) {
        if (StringUtils.isBlank(userId)) {
            return false;
        }
        UserSession session = sessionUserMap.get(userId.trim());
        return session != null && isSessionOpenAndFresh(session, LocalDateTime.now());
    }

    @Override
    public boolean isRouteOwnedByCurrentInstance(String userId) {
        if (StringUtils.isBlank(userId)) {
            return false;
        }
        String routeInstanceId = stringRedisTemplate.opsForValue().get(routeKey(userId.trim()));
        return instanceId.equals(routeInstanceId);
    }

    @Override
    public String getCurrentInstanceId() {
        return instanceId;
    }

    @Override
    public RouteSessionInfo getRouteSessionInfo(String userId) {
        if (StringUtils.isBlank(userId)) {
            return null;
        }
        String raw = stringRedisTemplate.opsForValue().get(routeSessionKey(userId.trim()));
        if (StringUtils.isBlank(raw)) {
            return null;
        }
        try {
            RouteSessionInfo info = JSON.parseObject(raw, RouteSessionInfo.class);
            if (info == null || StringUtils.isBlank(info.getInstanceId()) || StringUtils.isBlank(info.getSessionId())) {
                return null;
            }
            return info;
        } catch (Exception ex) {
            log.debug("解析路由会话信息失败: userId={}", userId, ex);
            return null;
        }
    }

    @Override
    public void publishSessionKickout(String targetInstanceId, String userId, String sessionId, String reason) {
        if (StringUtils.isBlank(targetInstanceId) || StringUtils.isBlank(userId) || StringUtils.isBlank(sessionId)) {
            return;
        }
        try {
            WsPushEvent event = WsPushEvent.builder()
                    .eventId("kickout:" + userId.trim() + ":" + sessionId.trim() + ":" + System.currentTimeMillis())
                    .eventType(EVENT_TYPE_SESSION_KICKOUT)
                    .payload(JSON.toJSONString(Map.of(
                            "userId", userId.trim(),
                            "sessionId", sessionId.trim(),
                            "reason", StringUtils.defaultIfBlank(reason, "新连接建立")
                    )))
                    .createdAt(LocalDateTime.now())
                    .version(WS_PUSH_EVENT_VERSION)
                    .build();
            stringRedisTemplate.convertAndSend(wsChannelPrefix + targetInstanceId.trim(), JSON.toJSONString(event));
        } catch (Exception ex) {
            log.warn("发布跨实例踢下线事件失败: targetInstanceId={}, userId={}", targetInstanceId, userId, ex);
        }
    }

    @Override
    public boolean disconnectLocalSessionIfMatch(String userId, String sessionId, String reason) {
        if (StringUtils.isBlank(userId) || StringUtils.isBlank(sessionId)) {
            return false;
        }
        String normalizedUserId = userId.trim();
        UserSession currentSession = sessionUserMap.get(normalizedUserId);
        if (currentSession == null) {
            return false;
        }
        String currentSessionId = resolveSessionId(currentSession);
        if (!sessionId.trim().equals(currentSessionId)) {
            return false;
        }
        boolean removed = sessionUserMap.remove(normalizedUserId, currentSession);
        if (!removed) {
            return false;
        }
        closeSessionQuietly(
                normalizedUserId,
                currentSession.getWebSocketSession(),
                CloseStatus.NORMAL.withReason(StringUtils.defaultIfBlank(reason, "新连接建立"))
        );
        return true;
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

    private boolean pushPayloadToUser(Long userId, String wsType, Object payloadData) {
        String userIdStr = String.valueOf(userId);
        UserSession userSession = sessionUserMap.get(userIdStr);
        if (userSession == null || userSession.getWebSocketSession() == null || !userSession.getWebSocketSession().isOpen()) {
            log.debug("用户 {} 不在线或连接断开，事件未推送, type={}", userIdStr, wsType);
            return false;
        }

        Map<String, Object> wsMessage = new HashMap<>();
        wsMessage.put("type", wsType);
        wsMessage.put("data", payloadData);
        wsMessage.put("timestamp", System.currentTimeMillis());
        String textMessage = JSON.toJSONString(wsMessage, com.alibaba.fastjson2.JSONWriter.Feature.WriteLongAsString);

        try {
            userSession.getWebSocketSession().sendMessage(new TextMessage(textMessage));
            return true;
        } catch (Exception e) {
            log.warn("推送事件失败: userId={}, type={}, error={}", userIdStr, wsType, e.getMessage());
            return false;
        }
    }

    private void logPushMessageResult(MessageDTO message, Long receiverId, boolean success) {
        String senderId = message.getSenderId() == null ? "" : String.valueOf(message.getSenderId());
        String targetUserId = receiverId == null ? "" : String.valueOf(receiverId);
        String content = StringUtils.defaultString(message.getContent())
                .replace("\r", " ")
                .replace("\n", " ");
        String status = success ? "success" : "fail";
        log.info("发送id【{}】，接收id【{}】，消息内容【{}】状态【{}】", senderId, targetUserId, content, status);
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

    private void storeRouteState(String userId, String sessionId) {
        if (StringUtils.isBlank(userId) || StringUtils.isBlank(sessionId)) {
            return;
        }
        stringRedisTemplate.opsForValue().set(routeKey(userId), instanceId, HEARTBEAT_TIMEOUT);
        stringRedisTemplate.opsForValue().set(
                routeSessionKey(userId),
                JSON.toJSONString(new RouteSessionInfo(instanceId, sessionId)),
                HEARTBEAT_TIMEOUT
        );
    }

    private String resolveSessionId(UserSession userSession) {
        if (userSession == null || userSession.getWebSocketSession() == null) {
            return null;
        }
        return userSession.getWebSocketSession().getId();
    }

    private void closeSessionQuietly(String userId, WebSocketSession webSocketSession) {
        closeSessionQuietly(userId, webSocketSession, null);
    }

    private void closeSessionQuietly(String userId, WebSocketSession webSocketSession, CloseStatus status) {
        if (webSocketSession == null || !webSocketSession.isOpen()) {
            return;
        }
        try {
            if (status == null) {
                webSocketSession.close();
            } else {
                webSocketSession.close(status);
            }
        } catch (Exception closeError) {
            log.debug("关闭离线用户会话失败: userId={}", userId, closeError);
        }
    }

    private String routeKey(String userId) {
        return routeUserKeyPrefix + userId;
    }

    private String routeSessionKey(String userId) {
        return routeSessionKeyPrefix + userId;
    }
}
