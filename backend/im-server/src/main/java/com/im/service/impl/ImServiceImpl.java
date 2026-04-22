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
import com.im.service.presence.PresenceTransitionDeduplicator;
import com.im.service.route.UserRouteRegistry;
import com.im.websocket.WebSocketErrorSemantics;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

@Slf4j
@Service
@RequiredArgsConstructor
public class ImServiceImpl implements IImService {

    private static final int USER_LOCK_STRIPE_COUNT = 1024;
    private static final int DEFAULT_OUTBOUND_MAILBOX_CAPACITY = 64;
    private static final int DEFAULT_OUTBOUND_FAILURE_THRESHOLD = 3;
    private static final long MAILBOX_RETRY_DELAY_MS = 50L;
    private static final CloseStatus SEND_FAILED_CLOSE_STATUS = WebSocketErrorSemantics.SESSION_CLOSED_OR_STALE;
    private static final CloseStatus STALE_SESSION_CLOSE_STATUS = WebSocketErrorSemantics.SESSION_CLOSED_OR_STALE;

    private final RedissonClient redissonClient;
    private final ImNodeIdentity nodeIdentity;
    private final UserRouteRegistry routeRegistry;
    private final PresenceTransitionDeduplicator presenceTransitionDeduplicator;
    private final Map<String, UserSession> sessionsById = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> sessionIdsByUser = new ConcurrentHashMap<>();
    private final Set<String> failedSessionIds = ConcurrentHashMap.newKeySet();
    private final Map<String, ScheduledFuture<?>> pendingOfflineTransitions = new ConcurrentHashMap<>();
    private final Map<String, OutboundMailbox> outboundMailboxes = new ConcurrentHashMap<>();
    private final ReentrantLock[] userLocks = createUserLocks(USER_LOCK_STRIPE_COUNT);
    private final AtomicInteger outboundSendThreadCounter = new AtomicInteger();
    private final ScheduledExecutorService presenceTransitionExecutor = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "im-presence-transition");
        thread.setDaemon(true);
        return thread;
    });
    private final ScheduledExecutorService outboundControlExecutor = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "im-ws-outbound-control");
        thread.setDaemon(true);
        return thread;
    });
    private final ExecutorService outboundSendExecutor = createOutboundSendExecutor();

    @Value("${im.ws.presence-channel:im:presence:broadcast}")
    private String presenceChannel;

    @Value("${im.ws.presence-offline-grace-ms:1500}")
    private long presenceOfflineGraceMs;

    @Value("${im.heartbeat.timeout:90000}")
    private long heartbeatTimeoutMs;

    @Value("${im.websocket.send-dispatch-timeout-ms:1000}")
    private long sendDispatchTimeoutMs;

    @Value("${im.websocket.outbound-mailbox-capacity:" + DEFAULT_OUTBOUND_MAILBOX_CAPACITY + "}")
    private int outboundMailboxCapacity;

    @Value("${im.websocket.outbound-send-failure-threshold:" + DEFAULT_OUTBOUND_FAILURE_THRESHOLD + "}")
    private int outboundSendFailureThreshold;

    @Value("${im.websocket.outbound-send-timeout-threshold:" + DEFAULT_OUTBOUND_FAILURE_THRESHOLD + "}")
    private int outboundSendTimeoutThreshold;

    @Autowired(required = false)
    private ImServerMetrics metrics;

    @PostConstruct
    public void init() {
        if (metrics != null) {
            metrics.bindConnectionGauges(() -> sessionsById.size(), () -> sessionIdsByUser.size());
        }
    }

    @PreDestroy
    public void destroy() {
        for (ScheduledFuture<?> future : pendingOfflineTransitions.values()) {
            if (future != null) {
                future.cancel(false);
            }
        }
        pendingOfflineTransitions.clear();
        for (OutboundMailbox mailbox : outboundMailboxes.values()) {
            if (mailbox != null) {
                mailbox.close();
            }
        }
        outboundMailboxes.clear();
        presenceTransitionExecutor.shutdownNow();
        outboundControlExecutor.shutdownNow();
        outboundSendExecutor.shutdownNow();
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
                    failedSessionIds.remove(sessionId);
                    cleanupOutboundMailbox(sessionId);
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
        scheduleOfflineTransitionIfNeeded(normalizedUserId, true);
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
        boolean success = pushPayloadToSessions(getLocalSessions(String.valueOf(userId)), wsType, message);
        logPushMessageResult(message, userId, success);
        return success;
    }

    @Override
    public boolean pushReadReceiptToUser(ReadReceiptDTO receipt, Long userId) {
        if (receipt == null || userId == null) {
            return false;
        }
        return pushPayloadToSessions(getLocalSessions(String.valueOf(userId)), "READ_RECEIPT", receipt);
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
        int[] activeSessionCount = new int[1];
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
                String normalizedSessionId = normalizeSessionId(sessionId);
                if (normalizedSessionId == null || failedSessionIds.contains(normalizedSessionId)) {
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
            if (updated) {
                activeSessionCount[0] = countActiveLocalSessions(normalizedUserId, now);
                cancelPendingOfflineTransition(normalizedUserId);
                refreshRouteRegistration(normalizedUserId, activeSessionCount[0]);
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
            String normalizedSessionId = normalizeSessionId(sessionId);
            if (normalizedSessionId == null || failedSessionIds.contains(normalizedSessionId)) {
                return null;
            }
            UserSession userSession = sessionsById.get(normalizedSessionId);
            if (userSession == null || !normalizedUserId.equals(normalizeUserId(userSession.getUserId()))) {
                return null;
            }
            WebSocketSession webSocketSession = userSession.getWebSocketSession();
            if (webSocketSession == null || !webSocketSession.isOpen()) {
                return null;
            }
            LocalDateTime now = LocalDateTime.now();
            userSession.setLastHeartbeat(now);
            userSession.setStatus(UserStatus.ONLINE);
            cancelPendingOfflineTransition(normalizedUserId);
            refreshRouteRegistration(normalizedUserId, countActiveLocalSessions(normalizedUserId, now));
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
                && isSessionOpenAndFresh(sessionId.trim(), userSession, LocalDateTime.now());
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
            if (userSession != null && isSessionOpenAndFresh(sessionId, userSession, now)) {
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
        boolean[] wasGloballyOnline = new boolean[1];
        boolean firstLocalSession = withUserLock(normalizedUserId, () -> {
            userSession.setUserId(normalizedUserId);
            userSession.setStatus(UserStatus.ONLINE);
            userSession.setLastHeartbeat(now);
            failedSessionIds.remove(sessionId);
            prepareOutboundMailbox(normalizedUserId, sessionId);

            Set<String> sessionIds = sessionIdsByUser.computeIfAbsent(normalizedUserId, key -> ConcurrentHashMap.newKeySet());
            boolean firstLocal = sessionIds.stream()
                    .map(sessionsById::get)
                    .noneMatch(existingSession -> isSessionOpenAndFresh(resolveSessionId(existingSession), existingSession, now));
            if (firstLocal) {
                wasGloballyOnline[0] = isUserGloballyOnline(normalizedUserId);
            }
            sessionIds.add(sessionId);
            sessionsById.put(sessionId, userSession);
            upsertRouteRegistration(normalizedUserId, countActiveLocalSessions(normalizedUserId, now));
            return firstLocal;
        });

        if (firstLocalSession) {
            maybeBroadcastOnlineTransition(normalizedUserId, wasGloballyOnline[0]);
        }
    }

    @Override
    public boolean unregisterSession(String userId, String sessionId, CloseStatus closeStatus) {
        String normalizedSessionId = normalizeSessionId(sessionId);
        if (normalizedSessionId == null) {
            return false;
        }

        String normalizedUserId = normalizeUserId(userId);
        if (normalizedUserId == null) {
            UserSession existingSession = sessionsById.get(normalizedSessionId);
            normalizedUserId = existingSession == null ? null : normalizeUserId(existingSession.getUserId());
        }
        if (normalizedUserId == null) {
            return false;
        }

        String lockedUserId = normalizedUserId;
        List<UserSession> removedSessions = new ArrayList<>(1);
        boolean[] lastLocalSession = new boolean[1];
        boolean[] wasGloballyOnline = new boolean[1];
        int[] activeSessionCount = new int[1];
        boolean removed = withUserLock(lockedUserId, () -> {
            UserSession existingSession = sessionsById.get(normalizedSessionId);
            if (existingSession == null) {
                return false;
            }
            if (!lockedUserId.equals(normalizeUserId(existingSession.getUserId()))) {
                return false;
            }

            UserSession removedSession = sessionsById.remove(normalizedSessionId);
            if (removedSession == null) {
                return false;
            }
            failedSessionIds.remove(normalizedSessionId);
            cleanupOutboundMailbox(normalizedSessionId);
            removedSessions.add(removedSession);

            Set<String> sessionIds = sessionIdsByUser.get(lockedUserId);
            if (sessionIds == null) {
                removeRouteRegistration(lockedUserId);
                lastLocalSession[0] = true;
                return true;
            }
            sessionIds.remove(normalizedSessionId);
            if (sessionIds.isEmpty()) {
                sessionIdsByUser.remove(lockedUserId);
            }
            activeSessionCount[0] = countActiveLocalSessions(lockedUserId, LocalDateTime.now());
            if (activeSessionCount[0] <= 0) {
                wasGloballyOnline[0] = isUserGloballyOnline(lockedUserId);
                removeRouteRegistration(lockedUserId);
                lastLocalSession[0] = true;
            } else {
                cancelPendingOfflineTransition(lockedUserId);
                refreshRouteRegistration(lockedUserId, activeSessionCount[0]);
            }
            return true;
        });

        if (!removed) {
            return false;
        }

        UserSession removedSession = removedSessions.get(0);
        closeSessionQuietly(lockedUserId, removedSession.getWebSocketSession(), closeStatus);
        if (lastLocalSession[0]) {
            scheduleOfflineTransitionIfNeeded(lockedUserId, wasGloballyOnline[0]);
        }
        return true;
    }

    private boolean isSessionOpenAndFresh(String sessionId, UserSession userSession, LocalDateTime now) {
        if (userSession == null || userSession.getStatus() != UserStatus.ONLINE) {
            return false;
        }
        String normalizedSessionId = normalizeSessionId(sessionId);
        if (normalizedSessionId == null || failedSessionIds.contains(normalizedSessionId)) {
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

    private boolean pushPayloadToSessions(List<UserSession> targetSessions, String wsType, Object payloadData) {
        return pushPayloadToSessions(targetSessions, wsType, payloadData, OutboundPriority.BUSINESS);
    }

    private boolean pushPayloadToSessions(List<UserSession> targetSessions,
                                          String wsType,
                                          Object payloadData,
                                          OutboundPriority priority) {
        if (targetSessions == null || targetSessions.isEmpty()) {
            return false;
        }
        String textMessage = buildTextMessage(wsType, payloadData);
        List<SessionSendAttempt> attempts = new ArrayList<>(targetSessions.size());
        for (UserSession userSession : targetSessions) {
            String sessionId = resolveSessionId(userSession);
            if (StringUtils.isBlank(sessionId)) {
                continue;
            }
            attempts.add(submitTextSend(userSession, sessionId, wsType, textMessage, priority));
        }

        boolean success = false;
        for (SessionSendAttempt attempt : attempts) {
            success = awaitSendResult(attempt) || success;
        }
        return success;
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

        return awaitSendResult(submitTextSend(
                userSession,
                normalizedSessionId,
                wsType,
                buildTextMessage(wsType, payloadData),
                OutboundPriority.BUSINESS
        ));
    }

    private String buildTextMessage(String wsType, Object payloadData) {
        Map<String, Object> wsMessage = new HashMap<>();
        wsMessage.put("type", wsType);
        wsMessage.put("data", payloadData);
        wsMessage.put("timestamp", System.currentTimeMillis());
        return JSON.toJSONString(wsMessage, com.alibaba.fastjson2.JSONWriter.Feature.WriteLongAsString);
    }

    private String normalizeReadWsType(String wsType) {
        return "READ_SYNC".equalsIgnoreCase(wsType) ? "READ_SYNC" : "READ_RECEIPT";
    }

    private void logPushMessageResult(MessageDTO message, Long receiverId, boolean success) {
        String targetUserId = receiverId == null ? "" : String.valueOf(receiverId);
        String messageId = message.getId() == null ? "" : String.valueOf(message.getId());
        String conversationId = resolveConversationId(message);
        String resultCode = success ? "OK" : "FAILED";
        log.info("Message push result. messageId={}, conversationId={}, targetUserId={}, resultCode={}",
                messageId, conversationId, targetUserId, resultCode);
    }

    private void publishAndBroadcastOnlineStatus(String userId, UserStatus status) {
        String lastSeen = LocalDateTime.now().toString();
        broadcastOnlineStatus(userId, status, lastSeen);
        publishPresenceEvent(userId, status, lastSeen);
    }

    private void maybeBroadcastOnlineTransition(String userId, boolean wasGloballyOnline) {
        cancelPendingOfflineTransition(userId);
        if (wasGloballyOnline || !isUserGloballyOnline(userId)) {
            return;
        }
        if (presenceTransitionDeduplicator.tryTransition(userId, UserStatus.ONLINE)) {
            recordRouteRegistryStateTransition("online");
            publishAndBroadcastOnlineStatus(userId, UserStatus.ONLINE);
        }
    }

    private void scheduleOfflineTransitionIfNeeded(String userId, boolean wasGloballyOnline) {
        if (StringUtils.isBlank(userId) || !wasGloballyOnline || isUserGloballyOnline(userId)) {
            return;
        }
        cancelPendingOfflineTransition(userId);
        Runnable transitionTask = () -> {
            pendingOfflineTransitions.remove(userId);
            if (isUserGloballyOnline(userId)) {
                return;
            }
            if (presenceTransitionDeduplicator.tryTransition(userId, UserStatus.OFFLINE)) {
                recordRouteRegistryStateTransition("offline");
                publishAndBroadcastOnlineStatus(userId, UserStatus.OFFLINE);
            }
        };
        long delayMs = Math.max(0L, presenceOfflineGraceMs);
        if (delayMs == 0L) {
            transitionTask.run();
            return;
        }
        ScheduledFuture<?> future = presenceTransitionExecutor.schedule(transitionTask, delayMs, TimeUnit.MILLISECONDS);
        pendingOfflineTransitions.put(userId, future);
    }

    private void cancelPendingOfflineTransition(String userId) {
        if (StringUtils.isBlank(userId)) {
            return;
        }
        ScheduledFuture<?> future = pendingOfflineTransitions.remove(userId);
        if (future != null) {
            future.cancel(false);
        }
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

        sendTextToSessions(new ArrayList<>(sessionsById.values()), "ONLINE_STATUS", text, OutboundPriority.BROADCAST);
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

    private boolean sendTextToSessions(List<UserSession> targetSessions,
                                       String wsType,
                                       String textMessage,
                                       OutboundPriority priority) {
        if (targetSessions == null || targetSessions.isEmpty()) {
            return false;
        }
        List<SessionSendAttempt> attempts = new ArrayList<>(targetSessions.size());
        for (UserSession session : targetSessions) {
            String sessionId = resolveSessionId(session);
            if (StringUtils.isBlank(sessionId)) {
                continue;
            }
            attempts.add(submitTextSend(session, sessionId, wsType, textMessage, priority));
        }
        boolean success = false;
        for (SessionSendAttempt attempt : attempts) {
            success = awaitSendResult(attempt) || success;
        }
        return success;
    }

    private SessionSendAttempt submitTextSend(UserSession userSession,
                                              String sessionId,
                                              String wsType,
                                              String textMessage,
                                              OutboundPriority priority) {
        long startNanos = System.nanoTime();
        String normalizedSessionId = normalizeSessionId(sessionId);
        if (userSession == null || normalizedSessionId == null) {
            return SessionSendAttempt.immediateFailure(null, normalizedSessionId, wsType, startNanos);
        }

        String normalizedUserId = normalizeUserId(userSession.getUserId());
        WebSocketSession webSocketSession = userSession.getWebSocketSession();
        if (failedSessionIds.contains(normalizedSessionId) || webSocketSession == null || !webSocketSession.isOpen()) {
            cleanupInactiveSession(normalizedUserId, normalizedSessionId);
            return SessionSendAttempt.immediateFailure(normalizedUserId, normalizedSessionId, wsType, startNanos);
        }

        OutboundMailbox mailbox = prepareOutboundMailbox(normalizedUserId, normalizedSessionId);
        if (mailbox == null || mailbox.isClosed()) {
            return SessionSendAttempt.immediateFailure(normalizedUserId, normalizedSessionId, wsType, startNanos);
        }

        OutboundEnvelope envelope = new OutboundEnvelope(
                normalizedUserId,
                normalizedSessionId,
                wsType,
                textMessage,
                startNanos,
                priority == null ? OutboundPriority.BUSINESS : priority
        );
        MailboxOffer offer = mailbox.offer(envelope);
        if (offer.droppedEnvelope() != null) {
            recordPush(offer.droppedEnvelope().wsType(), false, offer.droppedEnvelope().startNanos());
        }
        if (!offer.accepted()) {
            log.warn("Outbound mailbox rejected message. userId={}, sessionId={}, type={}, priority={}, queueCapacity={}",
                    normalizedUserId,
                    normalizedSessionId,
                    wsType,
                    envelope.priority(),
                    resolveOutboundMailboxCapacity());
            return SessionSendAttempt.immediateFailure(normalizedUserId, normalizedSessionId, wsType, startNanos);
        }
        scheduleMailboxDrain(mailbox);
        return SessionSendAttempt.accepted(normalizedUserId, normalizedSessionId, wsType, startNanos);
    }

    private boolean awaitSendResult(SessionSendAttempt attempt) {
        if (attempt == null) {
            return false;
        }
        if (attempt.accepted()) {
            return true;
        }
        recordPush(attempt.wsType(), false, attempt.startNanos());
        return false;
    }

    private void recordPush(String wsType, boolean success, long startNanos) {
        if (metrics != null) {
            metrics.recordPush(wsType, success, Duration.ofNanos(System.nanoTime() - startNanos));
        }
    }

    private void recordRouteRegistryStateTransition(String transition) {
        if (metrics != null) {
            metrics.recordRouteRegistryStateTransition(transition);
        }
    }

    private void handleSendFailure(String userId, String sessionId, String wsType, Throwable sendError) {
        String normalizedSessionId = normalizeSessionId(sessionId);
        if (normalizedSessionId != null) {
            failedSessionIds.add(normalizedSessionId);
        }
        log.warn("WebSocket send failed. errorCode={}, userId={}, sessionId={}, type={}, closeStatus={}, error={}",
                WebSocketErrorSemantics.SESSION_ERROR_CODE,
                userId,
                normalizedSessionId,
                wsType,
                SEND_FAILED_CLOSE_STATUS,
                sendError == null ? null : sendError.getMessage());
        try {
            unregisterSession(userId, normalizedSessionId, SEND_FAILED_CLOSE_STATUS);
        } catch (Exception cleanupError) {
            log.warn("Cleanup websocket session after send failure failed. errorCode={}, userId={}, sessionId={}, closeStatus={}, error={}",
                    WebSocketErrorSemantics.SESSION_ERROR_CODE,
                    userId,
                    normalizedSessionId,
                    SEND_FAILED_CLOSE_STATUS,
                    cleanupError.getMessage());
        }
    }

    private void scheduleMailboxDrain(OutboundMailbox mailbox) {
        if (mailbox == null || !mailbox.tryStartDrain()) {
            return;
        }
        if (outboundSendExecutor.isShutdown()) {
            mailbox.markDrainNotRunning();
            return;
        }
        try {
            outboundSendExecutor.execute(() -> drainMailbox(mailbox));
        } catch (RejectedExecutionException rejectedExecutionException) {
            mailbox.markDrainNotRunning();
            log.warn("Schedule outbound mailbox drain rejected. userId={}, sessionId={}",
                    mailbox.userId(), mailbox.sessionId(), rejectedExecutionException);
            scheduleMailboxDrainRetry(mailbox);
        }
    }

    private void scheduleMailboxDrainRetry(OutboundMailbox mailbox) {
        if (mailbox == null || mailbox.isClosed() || outboundControlExecutor.isShutdown()) {
            return;
        }
        try {
            outboundControlExecutor.schedule(() -> scheduleMailboxDrain(mailbox),
                    MAILBOX_RETRY_DELAY_MS,
                    TimeUnit.MILLISECONDS);
        } catch (RejectedExecutionException rejectedExecutionException) {
            log.warn("Schedule outbound mailbox retry rejected. userId={}, sessionId={}",
                    mailbox.userId(), mailbox.sessionId(), rejectedExecutionException);
        }
    }

    private void drainMailbox(OutboundMailbox mailbox) {
        while (true) {
            OutboundSendTask sendTask = mailbox.beginNextSend();
            if (sendTask == null) {
                return;
            }
            processOutboundSend(mailbox, sendTask);
            if (mailbox.isClosed()) {
                return;
            }
        }
    }

    private void processOutboundSend(OutboundMailbox mailbox, OutboundSendTask sendTask) {
        OutboundEnvelope envelope = sendTask.envelope();
        UserSession currentSession = sessionsById.get(envelope.sessionId());
        WebSocketSession webSocketSession = currentSession == null ? null : currentSession.getWebSocketSession();
        if (webSocketSession == null || !webSocketSession.isOpen()) {
            mailbox.completeWithoutCounting(sendTask.token());
            cleanupInactiveSession(envelope.userId(), envelope.sessionId());
            recordPush(envelope.wsType(), false, envelope.startNanos());
            return;
        }

        ScheduledFuture<?> timeoutFuture = scheduleSendTimeout(mailbox, sendTask);
        try {
            webSocketSession.sendMessage(new TextMessage(envelope.textMessage()));
            boolean timedOut = mailbox.completeSuccess(sendTask.token(), timeoutFuture);
            if (!timedOut) {
                recordPush(envelope.wsType(), true, envelope.startNanos());
            }
        } catch (Exception sendError) {
            IoFailureOutcome outcome = mailbox.completeIoFailure(sendTask.token(), timeoutFuture);
            if (!outcome.counted()) {
                return;
            }
            log.warn("WebSocket send failed. userId={}, sessionId={}, type={}, ioFailureCount={}, threshold={}, error={}",
                    envelope.userId(),
                    envelope.sessionId(),
                    envelope.wsType(),
                    outcome.currentCount(),
                    resolveOutboundSendFailureThreshold(),
                    sendError == null ? null : sendError.getMessage());
            recordPush(envelope.wsType(), false, envelope.startNanos());
            if (outcome.thresholdExceeded()) {
                handleSendFailure(envelope.userId(), envelope.sessionId(), envelope.wsType(), sendError);
            }
        }
    }

    private ScheduledFuture<?> scheduleSendTimeout(OutboundMailbox mailbox, OutboundSendTask sendTask) {
        if (outboundControlExecutor.isShutdown()) {
            return null;
        }
        try {
            return outboundControlExecutor.schedule(
                    () -> handleSendTimeout(mailbox, sendTask),
                    resolveSendDispatchTimeoutMs(),
                    TimeUnit.MILLISECONDS
            );
        } catch (RejectedExecutionException rejectedExecutionException) {
            log.warn("Schedule outbound send timeout rejected. userId={}, sessionId={}, type={}",
                    sendTask.envelope().userId(),
                    sendTask.envelope().sessionId(),
                    sendTask.envelope().wsType(),
                    rejectedExecutionException);
            return null;
        }
    }

    private void handleSendTimeout(OutboundMailbox mailbox, OutboundSendTask sendTask) {
        TimeoutOutcome outcome = mailbox.markTimeout(sendTask.token());
        if (!outcome.counted()) {
            return;
        }
        OutboundEnvelope envelope = sendTask.envelope();
        log.warn("WebSocket send timeout. userId={}, sessionId={}, type={}, timeoutCount={}, threshold={}, timeoutMs={}",
                envelope.userId(),
                envelope.sessionId(),
                envelope.wsType(),
                outcome.currentCount(),
                resolveOutboundSendTimeoutThreshold(),
                resolveSendDispatchTimeoutMs());
        recordPush(envelope.wsType(), false, envelope.startNanos());
        if (outcome.thresholdExceeded()) {
            handleSendFailure(envelope.userId(), envelope.sessionId(), envelope.wsType(),
                    new IllegalStateException("send timeout"));
        }
    }

    private OutboundMailbox prepareOutboundMailbox(String userId, String sessionId) {
        String normalizedUserId = normalizeUserId(userId);
        String normalizedSessionId = normalizeSessionId(sessionId);
        if (normalizedUserId == null || normalizedSessionId == null) {
            return null;
        }
        return outboundMailboxes.compute(normalizedSessionId, (key, existing) -> {
            if (existing == null || existing.isClosed() || !normalizedUserId.equals(existing.userId())) {
                if (existing != null) {
                    existing.close();
                }
                return new OutboundMailbox(normalizedUserId, normalizedSessionId, resolveOutboundMailboxCapacity());
            }
            return existing;
        });
    }

    private void cleanupOutboundMailbox(String sessionId) {
        String normalizedSessionId = normalizeSessionId(sessionId);
        if (normalizedSessionId == null) {
            return;
        }
        OutboundMailbox mailbox = outboundMailboxes.remove(normalizedSessionId);
        if (mailbox != null) {
            mailbox.close();
        }
    }

    private int countActiveLocalSessions(String userId, LocalDateTime now) {
        Set<String> sessionIds = sessionIdsByUser.get(userId);
        if (sessionIds == null || sessionIds.isEmpty()) {
            return 0;
        }
        int count = 0;
        for (String sessionId : new HashSet<>(sessionIds)) {
            if (isSessionOpenAndFresh(sessionId, sessionsById.get(sessionId), now)) {
                count++;
            }
        }
        return count;
    }

    private void upsertRouteRegistration(String userId, int sessionCount) {
        if (sessionCount <= 0) {
            removeRouteRegistration(userId);
            return;
        }
        routeRegistry.upsertLocalRoute(userId, getCurrentInstanceId(), sessionCount);
    }

    private void removeRouteRegistration(String userId) {
        routeRegistry.removeLocalRoute(userId, getCurrentInstanceId());
    }

    private boolean isUserGloballyOnline(String userId) {
        return routeRegistry.isUserGloballyOnline(userId);
    }

    private void refreshRouteRegistration(String userId, int sessionCount) {
        if (sessionCount <= 0) {
            removeRouteRegistration(userId);
            return;
        }
        routeRegistry.renewLocalRoute(userId, getCurrentInstanceId(), sessionCount);
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

    private long resolveSendDispatchTimeoutMs() {
        return Math.max(100L, sendDispatchTimeoutMs);
    }

    private int resolveOutboundMailboxCapacity() {
        return Math.max(1, outboundMailboxCapacity);
    }

    private int resolveOutboundSendFailureThreshold() {
        return Math.max(1, outboundSendFailureThreshold);
    }

    private int resolveOutboundSendTimeoutThreshold() {
        return Math.max(1, outboundSendTimeoutThreshold);
    }

    private String resolveConversationId(MessageDTO message) {
        if (message == null) {
            return "";
        }
        if (message.getGroupId() != null || message.isGroup() || Boolean.TRUE.equals(message.getIsGroupChat())) {
            return "g_" + (message.getGroupId() == null ? "0" : message.getGroupId());
        }
        if (message.getSenderId() == null || message.getReceiverId() == null) {
            return "";
        }
        long minUserId = Math.min(message.getSenderId(), message.getReceiverId());
        long maxUserId = Math.max(message.getSenderId(), message.getReceiverId());
        return "p_" + minUserId + "_" + maxUserId;
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

    private ExecutorService createOutboundSendExecutor() {
        int maxWorkers = Math.max(4, Runtime.getRuntime().availableProcessors() * 2);
        return new ThreadPoolExecutor(
                maxWorkers,
                maxWorkers,
                60L,
                TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(maxWorkers * 256),
                runnable -> {
                    Thread thread = new Thread(runnable,
                            "im-ws-mailbox-" + outboundSendThreadCounter.incrementAndGet());
                    thread.setDaemon(true);
                    return thread;
                });
    }

    private void cleanupInactiveSession(String userId, String sessionId) {
        try {
            unregisterSession(userId, sessionId, STALE_SESSION_CLOSE_STATUS);
        } catch (Exception cleanupError) {
            log.debug("Cleanup stale websocket session failed. userId={}, sessionId={}, closeStatus={}",
                    userId, sessionId, STALE_SESSION_CLOSE_STATUS, cleanupError);
        }
    }

    private enum OutboundPriority {
        BUSINESS,
        BROADCAST
    }

    private record SessionSendAttempt(String userId,
                                      String sessionId,
                                      String wsType,
                                      long startNanos,
                                      boolean accepted) {

        private static SessionSendAttempt accepted(String userId,
                                                   String sessionId,
                                                   String wsType,
                                                   long startNanos) {
            return new SessionSendAttempt(userId, sessionId, wsType, startNanos, true);
        }

        private static SessionSendAttempt immediateFailure(String userId,
                                                           String sessionId,
                                                           String wsType,
                                                           long startNanos) {
            return new SessionSendAttempt(userId, sessionId, wsType, startNanos, false);
        }
    }

    private record OutboundEnvelope(String userId,
                                    String sessionId,
                                    String wsType,
                                    String textMessage,
                                    long startNanos,
                                    OutboundPriority priority) {
    }

    private record OutboundSendTask(long token, OutboundEnvelope envelope) {
    }

    private record MailboxOffer(boolean accepted, OutboundEnvelope droppedEnvelope) {
        private static MailboxOffer accepted(OutboundEnvelope droppedEnvelope) {
            return new MailboxOffer(true, droppedEnvelope);
        }

        private static MailboxOffer rejected(OutboundEnvelope droppedEnvelope) {
            return new MailboxOffer(false, droppedEnvelope);
        }
    }

    private record TimeoutOutcome(boolean counted, boolean thresholdExceeded, int currentCount) {
        private static TimeoutOutcome ignored() {
            return new TimeoutOutcome(false, false, 0);
        }
    }

    private record IoFailureOutcome(boolean counted, boolean thresholdExceeded, int currentCount) {
        private static IoFailureOutcome ignored() {
            return new IoFailureOutcome(false, false, 0);
        }
    }

    private final class OutboundMailbox {
        private final String userId;
        private final String sessionId;
        private final int capacity;
        private final Deque<OutboundEnvelope> queue = new ArrayDeque<>();
        private boolean draining;
        private boolean closed;
        private boolean terminationRequested;
        private long activeSendToken;
        private boolean activeSendInProgress;
        private boolean activeSendTimedOut;
        private int consecutiveIoFailures;
        private int consecutiveTimeouts;

        private OutboundMailbox(String userId, String sessionId, int capacity) {
            this.userId = userId;
            this.sessionId = sessionId;
            this.capacity = Math.max(1, capacity);
        }

        private synchronized MailboxOffer offer(OutboundEnvelope envelope) {
            if (closed) {
                return MailboxOffer.rejected(null);
            }
            if (queue.size() >= capacity) {
                if (envelope.priority() == OutboundPriority.BROADCAST) {
                    return MailboxOffer.rejected(envelope);
                }
                OutboundEnvelope droppedEnvelope = dropNewestBroadcast();
                if (droppedEnvelope == null) {
                    return MailboxOffer.rejected(null);
                }
                queue.addLast(envelope);
                return MailboxOffer.accepted(droppedEnvelope);
            }
            queue.addLast(envelope);
            return MailboxOffer.accepted(null);
        }

        private synchronized boolean tryStartDrain() {
            if (closed || draining) {
                return false;
            }
            draining = true;
            return true;
        }

        private synchronized void markDrainNotRunning() {
            if (!closed) {
                draining = false;
            }
        }

        private synchronized OutboundSendTask beginNextSend() {
            if (closed) {
                draining = false;
                return null;
            }
            OutboundEnvelope envelope = queue.pollFirst();
            if (envelope == null) {
                draining = false;
                return null;
            }
            activeSendToken++;
            activeSendInProgress = true;
            activeSendTimedOut = false;
            return new OutboundSendTask(activeSendToken, envelope);
        }

        private synchronized TimeoutOutcome markTimeout(long token) {
            if (closed || !activeSendInProgress || activeSendToken != token || activeSendTimedOut) {
                return TimeoutOutcome.ignored();
            }
            activeSendTimedOut = true;
            consecutiveTimeouts++;
            consecutiveIoFailures = 0;
            boolean thresholdExceeded = consecutiveTimeouts >= resolveOutboundSendTimeoutThreshold() && !terminationRequested;
            if (thresholdExceeded) {
                terminationRequested = true;
            }
            return new TimeoutOutcome(true, thresholdExceeded, consecutiveTimeouts);
        }

        private synchronized boolean completeSuccess(long token, ScheduledFuture<?> timeoutFuture) {
            cancelTimeout(timeoutFuture);
            if (closed || !activeSendInProgress || activeSendToken != token) {
                return true;
            }
            boolean timedOut = activeSendTimedOut;
            activeSendInProgress = false;
            activeSendTimedOut = false;
            if (!timedOut) {
                consecutiveIoFailures = 0;
                consecutiveTimeouts = 0;
            }
            return timedOut;
        }

        private synchronized IoFailureOutcome completeIoFailure(long token, ScheduledFuture<?> timeoutFuture) {
            cancelTimeout(timeoutFuture);
            if (closed || !activeSendInProgress || activeSendToken != token) {
                return IoFailureOutcome.ignored();
            }
            activeSendInProgress = false;
            if (activeSendTimedOut) {
                activeSendTimedOut = false;
                return IoFailureOutcome.ignored();
            }
            consecutiveIoFailures++;
            consecutiveTimeouts = 0;
            boolean thresholdExceeded = consecutiveIoFailures >= resolveOutboundSendFailureThreshold() && !terminationRequested;
            if (thresholdExceeded) {
                terminationRequested = true;
            }
            return new IoFailureOutcome(true, thresholdExceeded, consecutiveIoFailures);
        }

        private synchronized void completeWithoutCounting(long token) {
            if (activeSendInProgress && activeSendToken == token) {
                activeSendInProgress = false;
                activeSendTimedOut = false;
            }
        }

        private synchronized void close() {
            closed = true;
            draining = false;
            terminationRequested = true;
            activeSendInProgress = false;
            queue.clear();
        }

        private synchronized boolean isClosed() {
            return closed;
        }

        private synchronized String userId() {
            return userId;
        }

        private synchronized String sessionId() {
            return sessionId;
        }

        private OutboundEnvelope dropNewestBroadcast() {
            Iterator<OutboundEnvelope> descendingIterator = queue.descendingIterator();
            while (descendingIterator.hasNext()) {
                OutboundEnvelope candidate = descendingIterator.next();
                if (candidate.priority() == OutboundPriority.BROADCAST) {
                    descendingIterator.remove();
                    return candidate;
                }
            }
            return null;
        }

        private void cancelTimeout(ScheduledFuture<?> timeoutFuture) {
            if (timeoutFuture != null) {
                timeoutFuture.cancel(false);
            }
        }
    }
}
