package com.im.handler;

import com.im.entity.UserSession;
import com.im.enums.UserStatus;
import com.im.service.IImService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;

import java.time.LocalDateTime;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketHandler implements org.springframework.web.socket.WebSocketHandler {

    private final IImService imService;
    private final WsMessageDispatcher dispatcher;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String userId = extractUserIdFromSession(session);
        if (StringUtils.isBlank(userId)) {
            log.warn("WebSocket connect rejected due to missing userId. session={}", session.getId());
            session.close(CloseStatus.BAD_DATA.withReason("invalid userId"));
            return;
        }

        UserSession userSession = UserSession.builder()
                .userId(userId)
                .status(UserStatus.ONLINE)
                .connectTime(LocalDateTime.now())
                .lastHeartbeat(LocalDateTime.now())
                .webSocketSession(session)
                .build();
        imService.registerSession(userId, userSession);
        log.debug("WebSocket connection established. userId={}, sessionId={}", userId, session.getId());
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
        dispatcher.dispatch(session, userId, payload);
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
}
