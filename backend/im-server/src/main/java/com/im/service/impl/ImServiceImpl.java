package com.im.service.impl;

import com.alibaba.fastjson2.JSON;
import com.im.config.ImNodeIdentity;
import com.im.dto.GroupMemberDTO;
import com.im.dto.MessageDTO;
import com.im.dto.PresenceEvent;
import com.im.dto.ReadReceiptDTO;
import com.im.entity.UserSession;
import com.im.enums.MessageType;
import com.im.enums.UserStatus;
import com.im.metrics.ImServerMetrics;
import com.im.service.IImService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.redisson.api.RBucket;
import org.redisson.api.RTopic;
import org.redisson.api.RSetMultimap;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

@Slf4j
@Service
@RequiredArgsConstructor
public class ImServiceImpl implements IImService {

    private static final String LEASE_VALUE = "1";
    private static final int USER_LOCK_STRIPE_COUNT = 1024;
    private static final CloseStatus SEND_FAILED_CLOSE_STATUS =
            CloseStatus.SESSION_NOT_RELIABLE.withReason("send failed");

    private final RedissonClient redissonClient;
    private final ImNodeIdentity nodeIdentity;
    private final Map<String, UserSession> sessionsById = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> sessionIdsByUser = new ConcurrentHashMap<>();
    private final ReentrantLock[] userLocks = createUserLocks(USER_LOCK_STRIPE_COUNT);

    @Value("${im.route.users-key:im:route:users}")
    private String routeUsersKey;

    @Value("${im.route.lease-key-prefix:im:route:lease:}")
    private String routeLeaseKeyPrefix;

    @Value("${im.ws.presence-channel:im:presence:broadcast}")
    private String presenceChannel;

    @Value("${im.route.lease-ttl-ms:120000}")
    private long routeLeaseTtlMs;

    @Value("${im.heartbeat.timeout:90000}")
    private long heartbeatTimeoutMs;

    @Autowired(required = false)
    private ImServerMetrics metrics;

    private RSetMultimap<String, String> routeMultimap;

    @PostConstruct
    public void init() {
        routeMultimap = redissonClient.getSetMultimap(routeUsersKey);
        if (metrics != null) {
            metrics.bindConnectionGauges(() -> sessionsById.size(), () -> sessionIdsByUser.size());
        }
    }

    @Override
    public boolean userOffline(String userId) {
        String normalizedUserId = normalizeUserId(userId);
        if (normalizedUserId == null) {
            return false;
        }

        List<UserSession> removedSessions = new ArrayList<>();
        boolean removed = withUserLock(normalizedUserId, () -> {
            Set<String> sessionIds = sessionIdsByUser.remove(normalizedUserId);
            if (sessionIds == null || sessionIds.isEmpty()) {
                return false;
            }
            for (String sessionId : new HashSet<>(sessionIds)) {
                UserSession session = sessionsById.remove(sessionId);
                if (session != null) {
                    removedSessions.add(session);
                }
            }
            removeRouteRegistration(normalizedUserId);
            return !removedSessions.isEmpty();
        });

        if (!removed) {
            return false;
        }

        for (UserSession removedSession : removedSessions) {
            closeSessionQuietly(normalizedUserId, removedSession.getWebSocketSession(), null);
        }
        if (!isUserGloballyOnline(normalizedUserId)) {
            publishAndBroadcastOnlineStatus(normalizedUserId, UserStatus.OFFLINE);
        }
        return true;
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
        for (GroupMemberDTO member : message.getGroupMembers()) {
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
        boolean success = false;
        for (UserSession userSession : getLocalSessions(String.valueOf(userId))) {
            String sessionId = resolveSessionId(userSession);
            if (StringUtils.isBlank(sessionId)) {
                continue;
            }
            success = pushPayloadToSession(sessionId, wsType, message) || success;
        }
        logPushMessageResult(message, userId, success);
        return success;
    }

    @Override
    public boolean pushReadReceiptToUser(ReadReceiptDTO receipt, Long userId) {
        if (receipt == null || userId == null) {
            return false;
        }
        boolean success = false;
        for (UserSession userSession : getLocalSessions(String.valueOf(userId))) {
            String sessionId = resolveSessionId(userSession);
            if (StringUtils.isBlank(sessionId)) {
                continue;
            }
            success = pushPayloadToSession(sessionId, "READ_RECEIPT", receipt) || success;
        }
        return success;
    }

    @Override
    public boolean pushMessageToSession(MessageDTO message, String sessionId) {
        if (message == null || StringUtils.isBlank(sessionId)) {
            return false;
        }
        String wsType = message.getMessageType() == MessageType.SYSTEM ? "SYSTEM" : "MESSAGE";
        return pushPayloadToSession(sessionId.trim(), wsType, message);
    }

    @Override
    public boolean pushReadReceiptToSession(ReadReceiptDTO receipt, String sessionId) {
        return pushReadReceiptToSession(receipt, sessionId, "READ_RECEIPT");
    }

    @Override
    public boolean pushReadReceiptToSession(ReadReceiptDTO receipt, String sessionId, String wsType) {
        if (receipt == null || StringUtils.isBlank(sessionId)) {
            return false;
        }
        return pushPayloadToSession(sessionId.trim(), normalizeReadWsType(wsType), receipt);
    }

    @Override
    public Map<String, Boolean> checkUsersOnlineStatus(List<String> userIds) {
        Map<String, Boolean> userStatusMap = new HashMap<>();
        if (userIds == null || userIds.isEmpty()) {
            return userStatusMap;
        }
        for (String rawUserId : userIds) {
            String normalizedUserId = normalizeUserId(rawUserId);
            if (normalizedUserId == null) {
                continue;
            }
            userStatusMap.put(normalizedUserId, isUserGloballyOnline(normalizedUserId));
        }
        return userStatusMap;
    }

    @Override
    public boolean touchUserHeartbeat(String userId) {
        String normalizedUserId = normalizeUserId(userId);
        if (normalizedUserId == null) {
            return false;
        }

        LocalDateTime now = LocalDateTime.now();
        boolean touched = withUserLock(normalizedUserId, () -> {
            Set<String> sessionIds = sessionIdsByUser.get(normalizedUserId);
            if (sessionIds == null || sessionIds.isEmpty()) {
                return false;
            }
            boolean updated = false;
            for (String sessionId : new HashSet<>(sessionIds)) {
                UserSession userSession = sessionsById.get(sessionId);
                if (userSession == null) {
                    continue;
                }
                WebSocketSession webSocketSession = userSession.getWebSocketSession();
                if (webSocketSession == null || !webSocketSession.isOpen()) {
                    continue;
                }
                userSession.setStatus(UserStatus.ONLINE);
                userSession.setLastHeartbeat(now);
                updated = true;
            }
            return updated;
        });

        if (!touched) {
            userOffline(normalizedUserId);
        }
        return touched;
    }

    @Override
    public void refreshRouteHeartbeat(String userId, String sessionId) {
        String normalizedUserId = normalizeUserId(userId);
        if (normalizedUserId == null || StringUtils.isBlank(sessionId)) {
            return;
        }
        withUserLock(normalizedUserId, () -> {
            UserSession userSession = sessionsById.get(sessionId.trim());
            if (userSession == null || !normalizedUserId.equals(normalizeUserId(userSession.getUserId()))) {
                return null;
            }
            WebSocketSession webSocketSession = userSession.getWebSocketSession();
            if (webSocketSession == null || !webSocketSession.isOpen()) {
                return null;
            }
            userSession.setLastHeartbeat(LocalDateTime.now());
            userSession.setStatus(UserStatus.ONLINE);
            return null;
        });
    }

    @Override
    public String getCurrentInstanceId() {
        return nodeIdentity.getInstanceId();
    }

    @Override
    public boolean isSessionActive(String userId, String sessionId) {
        String normalizedUserId = normalizeUserId(userId);
        if (normalizedUserId == null || StringUtils.isBlank(sessionId)) {
            return false;
        }
        UserSession userSession = sessionsById.get(sessionId.trim());
        return userSession != null
                && normalizedUserId.equals(normalizeUserId(userSession.getUserId()))
                && isSessionOpenAndFresh(userSession, LocalDateTime.now());
    }

    @Override
    public UserSession getSession(String sessionId) {
        if (StringUtils.isBlank(sessionId)) {
            return null;
        }
        return sessionsById.get(sessionId.trim());
    }

    @Override
    public Map<String, UserSession> getSessionsById() {
        return sessionsById;
    }

    @Override
    public List<UserSession> getLocalSessions(String userId) {
        String normalizedUserId = normalizeUserId(userId);
        if (normalizedUserId == null) {
            return List.of();
        }
        Set<String> sessionIds = sessionIdsByUser.get(normalizedUserId);
        if (sessionIds == null || sessionIds.isEmpty()) {
            return List.of();
        }
        LocalDateTime now = LocalDateTime.now();
        List<UserSession> sessions = new ArrayList<>();
        for (String sessionId : new HashSet<>(sessionIds)) {
            UserSession userSession = sessionsById.get(sessionId);
            if (userSession != null && isSessionOpenAndFresh(userSession, now)) {
                sessions.add(userSession);
            }
        }
        return sessions;
    }

    @Override
    public Set<String> getLocallyOnlineUserIds() {
        Set<String> userIds = new LinkedHashSet<>();
        for (String userId : sessionIdsByUser.keySet()) {
            if (!getLocalSessions(userId).isEmpty()) {
                userIds.add(userId);
            }
        }
        return userIds;
    }

    @Override
    public void registerSession(String userId, UserSession userSession) {
        String normalizedUserId = normalizeUserId(userId);
        String sessionId = resolveSessionId(userSession);
        if (normalizedUserId == null || StringUtils.isBlank(sessionId) || userSession == null) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        boolean firstLocalSession = withUserLock(normalizedUserId, () -> {
            userSession.setUserId(normalizedUserId);
            userSession.setStatus(UserStatus.ONLINE);
            userSession.setLastHeartbeat(now);

            Set<String> sessionIds = sessionIdsByUser.computeIfAbsent(normalizedUserId, key -> ConcurrentHashMap.newKeySet());
            boolean firstLocal = sessionIds.stream()
                    .map(sessionsById::get)
                    .noneMatch(existingSession -> isSessionOpenAndFresh(existingSession, now));
            sessionIds.add(sessionId);
            sessionsById.put(sessionId, userSession);

            if (firstLocal) {
                upsertRouteRegistration(normalizedUserId);
            }
            return firstLocal;
        });

        if (firstLocalSession) {
            publishAndBroadcastOnlineStatus(normalizedUserId, UserStatus.ONLINE);
        }
    }

    @Override
    public boolean unregisterSession(String userId, String sessionId, CloseStatus closeStatus) {
        if (StringUtils.isBlank(sessionId)) {
            return false;
        }

        String normalizedUserId = normalizeUserId(userId);
        if (normalizedUserId == null) {
            UserSession existingSession = sessionsById.get(sessionId.trim());
            normalizedUserId = existingSession == null ? null : normalizeUserId(existingSession.getUserId());
        }
        if (normalizedUserId == null) {
            return false;
        }

        String lockedUserId = normalizedUserId;
        List<UserSession> removedSessions = new ArrayList<>(1);
        boolean[] lastLocalSession = new boolean[1];
        boolean removed = withUserLock(lockedUserId, () -> {
            UserSession existingSession = sessionsById.get(sessionId.trim());
            if (existingSession == null) {
                return false;
            }
            if (!lockedUserId.equals(normalizeUserId(existingSession.getUserId()))) {
                return false;
            }

            UserSession removedSession = sessionsById.remove(sessionId.trim());
            if (removedSession == null) {
                return false;
            }
            removedSessions.add(removedSession);

            Set<String> sessionIds = sessionIdsByUser.get(lockedUserId);
            if (sessionIds != null) {
                sessionIds.remove(sessionId.trim());
                if (sessionIds.isEmpty()) {
                    sessionIdsByUser.remove(lockedUserId);
                    removeRouteRegistration(lockedUserId);
                    lastLocalSession[0] = true;
                }
            }
            return true;
        });

        if (!removed) {
            return false;
        }

        UserSession removedSession = removedSessions.get(0);
        closeSessionQuietly(lockedUserId, removedSession.getWebSocketSession(), closeStatus);
        if (lastLocalSession[0] && !isUserGloballyOnline(lockedUserId)) {
            publishAndBroadcastOnlineStatus(lockedUserId, UserStatus.OFFLINE);
        }
        return true;
    }

    private boolean isSessionOpenAndFresh(UserSession userSession, LocalDateTime now) {
        if (userSession == null || userSession.getStatus() != UserStatus.ONLINE) {
            return false;
        }
        WebSocketSession webSocketSession = userSession.getWebSocketSession();
        if (webSocketSession == null || !webSocketSession.isOpen()) {
            return false;
        }
        LocalDateTime lastHeartbeat = userSession.getLastHeartbeat();
        if (lastHeartbeat == null) {
            return false;
        }
        return !lastHeartbeat.isBefore(now.minus(resolveHeartbeatTimeout()));
    }

    private boolean pushPayloadToSession(String sessionId, String wsType, Object payloadData) {
        String normalizedSessionId = normalizeSessionId(sessionId);
        if (normalizedSessionId == null) {
            return false;
        }

        UserSession userSession = sessionsById.get(normalizedSessionId);
        if (userSession == null) {
            return false;
        }

        Map<String, Object> wsMessage = new HashMap<>();
        wsMessage.put("type", wsType);
        wsMessage.put("data", payloadData);
        wsMessage.put("timestamp", System.currentTimeMillis());
        String textMessage = JSON.toJSONString(wsMessage, com.alibaba.fastjson2.JSONWriter.Feature.WriteLongAsString);

        return sendTextToSession(userSession, normalizedSessionId, wsType, textMessage);
    }

    private String normalizeReadWsType(String wsType) {
        return "READ_SYNC".equalsIgnoreCase(wsType) ? "READ_SYNC" : "READ_RECEIPT";
    }

    private void logPushMessageResult(MessageDTO message, Long receiverId, boolean success) {
        String senderId = message.getSenderId() == null ? "" : String.valueOf(message.getSenderId());
        String targetUserId = receiverId == null ? "" : String.valueOf(receiverId);
        String content = StringUtils.defaultString(message.getContent())
                .replace("\r", " ")
                .replace("\n", " ");
        String status = success ? "success" : "fail";
        log.info("Message push result. senderId={}, receiverId={}, content={}, status={}",
                senderId, targetUserId, content, status);
    }

    private void publishAndBroadcastOnlineStatus(String userId, UserStatus status) {
        String lastSeen = LocalDateTime.now().toString();
        broadcastOnlineStatus(userId, status, lastSeen);
        publishPresenceEvent(userId, status, lastSeen);
    }

    @Override
    public void broadcastOnlineStatus(String userId, UserStatus status, String lastSeen) {
        String normalizedUserId = normalizeUserId(userId);
        if (normalizedUserId == null || status == null) {
            return;
        }
        String resolvedLastSeen = StringUtils.defaultIfBlank(lastSeen, LocalDateTime.now().toString());
        Map<String, Object> data = new HashMap<>();
        data.put("userId", normalizedUserId);
        data.put("status", status == UserStatus.ONLINE ? "ONLINE" : "OFFLINE");
        data.put("lastSeen", resolvedLastSeen);

        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "ONLINE_STATUS");
        payload.put("data", data);
        payload.put("timestamp", System.currentTimeMillis());
        String text = JSON.toJSONString(payload);

        for (UserSession session : sessionsById.values()) {
            if (session == null) {
                continue;
            }
            String sessionId = resolveSessionId(session);
            if (StringUtils.isBlank(sessionId)) {
                continue;
            }
            sendTextToSession(session, sessionId, "ONLINE_STATUS", text);
        }
    }

    private void publishPresenceEvent(String userId, UserStatus status, String lastSeen) {
        String normalizedUserId = normalizeUserId(userId);
        if (normalizedUserId == null || status == null) {
            return;
        }
        try {
            PresenceEvent event = PresenceEvent.builder()
                    .userId(normalizedUserId)
                    .status(status.name())
                    .lastSeen(lastSeen)
                    .sourceInstanceId(getCurrentInstanceId())
                    .build();
            RTopic topic = redissonClient.getTopic(presenceChannel);
            topic.publish(event);
        } catch (Exception e) {
            log.warn("Publish presence event failed. userId={}, status={}, sourceInstanceId={}, error={}",
                    normalizedUserId, status, getCurrentInstanceId(), e.getMessage());
        }
    }

    private boolean sendTextToSession(UserSession userSession, String sessionId, String wsType, String textMessage) {
        long startNanos = System.nanoTime();
        boolean success = false;
        if (userSession == null || StringUtils.isBlank(sessionId)) {
            recordPush(wsType, false, startNanos);
            return false;
        }
        WebSocketSession webSocketSession = userSession.getWebSocketSession();
        if (webSocketSession == null || !webSocketSession.isOpen()) {
            recordPush(wsType, false, startNanos);
            return false;
        }
        try {
            webSocketSession.sendMessage(new TextMessage(textMessage));
            success = true;
            return true;
        } catch (Exception e) {
            handleSendFailure(userSession.getUserId(), sessionId, wsType, e);
            return false;
        } finally {
            recordPush(wsType, success, startNanos);
        }
    }

    private void recordPush(String wsType, boolean success, long startNanos) {
        if (metrics != null) {
            metrics.recordPush(wsType, success, Duration.ofNanos(System.nanoTime() - startNanos));
        }
    }

    private void handleSendFailure(String userId, String sessionId, String wsType, Exception sendError) {
        log.warn("WebSocket send failed. userId={}, sessionId={}, type={}, closeStatus={}, error={}",
                userId, sessionId, wsType, SEND_FAILED_CLOSE_STATUS, sendError == null ? null : sendError.getMessage());
        try {
            unregisterSession(userId, sessionId, SEND_FAILED_CLOSE_STATUS);
        } catch (Exception cleanupError) {
            log.warn("Cleanup websocket session after send failure failed. userId={}, sessionId={}, closeStatus={}, error={}",
                    userId, sessionId, SEND_FAILED_CLOSE_STATUS, cleanupError.getMessage());
        }
    }

    private void upsertRouteRegistration(String userId) {
        createLease(userId);
        routeMultimap.put(userId, getCurrentInstanceId());
    }

    private void removeRouteRegistration(String userId) {
        routeMultimap.remove(userId, getCurrentInstanceId());
        redissonClient.getBucket(leaseKey(userId, getCurrentInstanceId())).delete();
    }

    private boolean isUserGloballyOnline(String userId) {
        Set<String> routeInstanceIds = routeMultimap == null ? null : routeMultimap.getAll(userId);
        Set<String> instanceIds = routeInstanceIds == null ? new LinkedHashSet<>() : new LinkedHashSet<>(routeInstanceIds);
        if (instanceIds.isEmpty()) {
            return false;
        }
        boolean online = false;
        for (String instanceId : instanceIds) {
            if (StringUtils.isBlank(instanceId)) {
                continue;
            }
            String normalizedInstanceId = instanceId.trim();
            if (hasLiveLease(userId, normalizedInstanceId)) {
                online = true;
                continue;
            }
            routeMultimap.remove(userId, normalizedInstanceId);
        }
        return online;
    }

    private boolean hasLiveLease(String userId, String instanceId) {
        RBucket<String> bucket = redissonClient.getBucket(leaseKey(userId, instanceId));
        return bucket.isExists();
    }

    private void createLease(String userId) {
        redissonClient.getBucket(leaseKey(userId, getCurrentInstanceId()))
                .set(LEASE_VALUE, Math.max(1000L, routeLeaseTtlMs), TimeUnit.MILLISECONDS);
    }

    private String leaseKey(String userId, String instanceId) {
        return routeLeaseKeyPrefix + userId + ":" + instanceId;
    }

    private String resolveSessionId(UserSession userSession) {
        if (userSession == null || userSession.getWebSocketSession() == null) {
            return null;
        }
        return userSession.getWebSocketSession().getId();
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
            log.debug("Close websocket session failed. userId={}, sessionId={}, closeStatus={}",
                    userId, webSocketSession.getId(), status, closeError);
        }
    }

    private Duration resolveHeartbeatTimeout() {
        return Duration.ofMillis(Math.max(1000L, heartbeatTimeoutMs));
    }

    private String normalizeUserId(String userId) {
        return StringUtils.isBlank(userId) ? null : userId.trim();
    }

    private String normalizeSessionId(String sessionId) {
        return StringUtils.isBlank(sessionId) ? null : sessionId.trim();
    }

    private <T> T withUserLock(String userId, Supplier<T> supplier) {
        ReentrantLock lock = lockForUser(userId);
        lock.lock();
        try {
            return supplier.get();
        } finally {
            lock.unlock();
        }
    }

    private ReentrantLock lockForUser(String userId) {
        int hash = userId == null ? 0 : userId.hashCode();
        hash ^= (hash >>> 16);
        // Different users may share a stripe; this keeps memory fixed while preserving per-user serialization.
        return userLocks[Math.floorMod(hash, userLocks.length)];
    }

    private static ReentrantLock[] createUserLocks(int stripeCount) {
        if (stripeCount <= 0) {
            throw new IllegalArgumentException("stripeCount must be positive");
        }
        ReentrantLock[] locks = new ReentrantLock[stripeCount];
        for (int i = 0; i < stripeCount; i++) {
            locks[i] = new ReentrantLock();
        }
        return locks;
    }
}
