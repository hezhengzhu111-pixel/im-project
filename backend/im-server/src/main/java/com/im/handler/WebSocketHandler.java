package com.im.handler;

import com.im.entity.UserSession;
import com.im.enums.UserStatus;
import com.im.service.IImService;
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

    private final IImService imService;
    private final WsMessageDispatcher dispatcher;

    @Value("${im.websocket.send-time-limit-ms:" + DEFAULT_SEND_TIME_LIMIT_MS + "}")
    private int sendTimeLimitMs;

    @Value("${im.websocket.send-buffer-size-limit-bytes:" + DEFAULT_SEND_BUFFER_SIZE_LIMIT_BYTES + "}")
    private int sendBufferSizeLimitBytes;

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
            log.debug("Ignore websocket message from stale session. userId={}, sessionId={}", userId, session.getId());
            return;
        }

        String payload = message.getPayload() == null ? "" : message.getPayload().toString().trim();
        imService.refreshRouteHeartbeat(userId, session.getId());
        UserSession registeredSession = imService.getSession(session.getId());
        WebSocketSession dispatchSession = registeredSession == null || registeredSession.getWebSocketSession() == null
                ? session
                : registeredSession.getWebSocketSession();
        dispatcher.dispatch(dispatchSession, userId, payload);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        String userId = extractUserIdFromSession(session);
        log.error("WebSocket transport error. userId={}, sessionId={}, error={}",
                userId, session == null ? null : session.getId(), exception == null ? null : exception.getMessage());
        cleanupSession(session, CloseStatus.SERVER_ERROR.withReason("transport error"));
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
}
