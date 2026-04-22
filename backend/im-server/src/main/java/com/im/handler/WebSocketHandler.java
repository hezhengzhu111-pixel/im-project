package com.im.handler;

import com.im.entity.UserSession;
import com.im.enums.UserStatus;
import com.im.service.IImService;
import com.im.websocket.WebSocketErrorSemantics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

import java.time.LocalDateTime;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketHandler implements org.springframework.web.socket.WebSocketHandler {

    private static final int DEFAULT_SEND_TIME_LIMIT_MS = 10_000;
    private static final int DEFAULT_SEND_BUFFER_SIZE_LIMIT_BYTES = 512 * 1024;
    private static final int DEFAULT_MAX_PAYLOAD_LENGTH = 8 * 1024;
    private static final int DEFAULT_INVALID_PAYLOAD_THRESHOLD = 3;
    private static final String INVALID_PAYLOAD_COUNT_ATTR = WebSocketHandler.class.getName() + ".invalidPayloadCount";
    private static final CloseStatus INVALID_PAYLOAD_CLOSE_STATUS =
            CloseStatus.POLICY_VIOLATION.withReason("invalid payload");

    private final IImService imService;
    private final WsMessageDispatcher dispatcher;

    @Value("${im.websocket.send-time-limit-ms:" + DEFAULT_SEND_TIME_LIMIT_MS + "}")
    private int sendTimeLimitMs;

    @Value("${im.websocket.send-buffer-size-limit-bytes:" + DEFAULT_SEND_BUFFER_SIZE_LIMIT_BYTES + "}")
    private int sendBufferSizeLimitBytes;

    @Value("${im.websocket.max-payload-length:" + DEFAULT_MAX_PAYLOAD_LENGTH + "}")
    private int maxPayloadLength;

    @Value("${im.websocket.invalid-payload-threshold:" + DEFAULT_INVALID_PAYLOAD_THRESHOLD + "}")
    private int invalidPayloadThreshold;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String userId = extractUserIdFromSession(session);
        if (StringUtils.isBlank(userId)) {
            log.warn("WebSocket connect rejected due to missing userId. session={}", session.getId());
            session.close(CloseStatus.BAD_DATA.withReason("invalid userId"));
            return;
        }

        WebSocketSession sendSafeSession = decorateSession(session);
        UserSession userSession = UserSession.builder()
                .userId(userId)
                .status(UserStatus.ONLINE)
                .connectTime(LocalDateTime.now())
                .lastHeartbeat(LocalDateTime.now())
                .webSocketSession(sendSafeSession)
                .build();
        imService.registerSession(userId, userSession);
        log.debug("WebSocket connection established. userId={}, sessionId={}, sendTimeLimitMs={}, bufferSizeLimitBytes={}",
                userId, sendSafeSession.getId(), resolveSendTimeLimitMs(), resolveSendBufferSizeLimitBytes());
    }

    @Override
    public void handleMessage(WebSocketSession session, WebSocketMessage<?> message) {
        String userId = extractUserIdFromSession(session);
        if (StringUtils.isBlank(userId)) {
            log.warn("Unable to resolve userId from websocket session. session={}", session == null ? null : session.getId());
            return;
        }
        if (!imService.isSessionActive(userId, session.getId())) {
            log.debug("Ignore websocket message from stale session. errorCode={}, userId={}, sessionId={}",
                    WebSocketErrorSemantics.SESSION_ERROR_CODE, userId, session.getId());
            cleanupSession(session, WebSocketErrorSemantics.SESSION_CLOSED_OR_STALE);
            return;
        }

        String rawPayload = message.getPayload() == null ? "" : message.getPayload().toString();
        if (rawPayload.length() > resolveMaxPayloadLength()) {
            log.warn("WebSocket payload exceeds max length. userId={}, sessionId={}, payloadLength={}, maxPayloadLength={}",
                    userId, session.getId(), rawPayload.length(), resolveMaxPayloadLength());
            handleViolation(session, userId, "PAYLOAD_TOO_LARGE");
            return;
        }
        String payload = rawPayload.trim();
        UserSession registeredSession = imService.getSession(session.getId());
        WebSocketSession dispatchSession = registeredSession == null || registeredSession.getWebSocketSession() == null
                ? session
                : registeredSession.getWebSocketSession();
        WsMessageDispatcher.DispatchResult dispatchResult = dispatcher.dispatch(dispatchSession, userId, payload);
        if (isDispatchSuccessful(dispatchResult)) {
            resetViolationCount(session);
            imService.refreshRouteHeartbeat(userId, session.getId());
            return;
        }
        handleViolation(session, userId, dispatchResult.name());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        String userId = extractUserIdFromSession(session);
        log.error("WebSocket transport error. errorCode={}, userId={}, sessionId={}, error={}",
                WebSocketErrorSemantics.SESSION_ERROR_CODE,
                userId,
                session == null ? null : session.getId(),
                exception == null ? null : exception.getMessage());
        cleanupSession(session, WebSocketErrorSemantics.SESSION_CLOSED_OR_STALE);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus) {
        String userId = extractUserIdFromSession(session);
        log.debug("WebSocket connection closed. userId={}, sessionId={}, closeStatus={}",
                userId, session == null ? null : session.getId(), closeStatus);
        cleanupSession(session, closeStatus);
    }

    @Override
    public boolean supportsPartialMessages() {
        return false;
    }

    private String extractUserIdFromSession(WebSocketSession session) {
        if (session == null) {
            return null;
        }
        Object userIdAttr = session.getAttributes().get("userId");
        if (userIdAttr == null) {
            return null;
        }
        String userId = userIdAttr.toString().trim();
        return StringUtils.isBlank(userId) ? null : userId;
    }

    private void cleanupSession(WebSocketSession session, CloseStatus closeStatus) {
        if (session == null) {
            return;
        }
        String userId = extractUserIdFromSession(session);
        imService.unregisterSession(userId, session.getId(), closeStatus);
    }

    private WebSocketSession decorateSession(WebSocketSession session) {
        return new ConcurrentWebSocketSessionDecorator(
                session,
                resolveSendTimeLimitMs(),
                resolveSendBufferSizeLimitBytes());
    }

    private int resolveSendTimeLimitMs() {
        return sendTimeLimitMs > 0 ? sendTimeLimitMs : DEFAULT_SEND_TIME_LIMIT_MS;
    }

    private int resolveSendBufferSizeLimitBytes() {
        return sendBufferSizeLimitBytes > 0 ? sendBufferSizeLimitBytes : DEFAULT_SEND_BUFFER_SIZE_LIMIT_BYTES;
    }

    private int resolveMaxPayloadLength() {
        return maxPayloadLength > 0 ? maxPayloadLength : DEFAULT_MAX_PAYLOAD_LENGTH;
    }

    private int resolveInvalidPayloadThreshold() {
        return invalidPayloadThreshold > 0 ? invalidPayloadThreshold : DEFAULT_INVALID_PAYLOAD_THRESHOLD;
    }

    private boolean isDispatchSuccessful(WsMessageDispatcher.DispatchResult dispatchResult) {
        return dispatchResult == WsMessageDispatcher.DispatchResult.HEARTBEAT_OK
                || dispatchResult == WsMessageDispatcher.DispatchResult.BUSINESS_OK;
    }

    private void handleViolation(WebSocketSession session, String userId, String reason) {
        int violations = incrementViolationCount(session);
        int threshold = resolveInvalidPayloadThreshold();
        log.warn("WebSocket invalid payload detected. userId={}, sessionId={}, reason={}, violationCount={}, threshold={}",
                userId, session == null ? null : session.getId(), reason, violations, threshold);
        if (violations < threshold) {
            return;
        }
        log.warn("Closing websocket session due to repeated invalid payloads. userId={}, sessionId={}, reason={}, threshold={}",
                userId, session == null ? null : session.getId(), reason, threshold);
        closeSessionForViolation(session);
        cleanupSession(session, INVALID_PAYLOAD_CLOSE_STATUS);
    }

    private int incrementViolationCount(WebSocketSession session) {
        if (session == null) {
            return 1;
        }
        Object current = session.getAttributes().get(INVALID_PAYLOAD_COUNT_ATTR);
        int next = current instanceof Number number ? number.intValue() + 1 : 1;
        session.getAttributes().put(INVALID_PAYLOAD_COUNT_ATTR, next);
        return next;
    }

    private void resetViolationCount(WebSocketSession session) {
        if (session != null) {
            session.getAttributes().remove(INVALID_PAYLOAD_COUNT_ATTR);
        }
    }

    private void closeSessionForViolation(WebSocketSession session) {
        if (session == null) {
            return;
        }
        try {
            session.close(INVALID_PAYLOAD_CLOSE_STATUS);
        } catch (Exception ex) {
            log.warn("Failed to close websocket session after invalid payload threshold reached. sessionId={}",
                    session.getId(), ex);
        }
    }
}
