package com.im.handler;

import com.alibaba.fastjson2.JSON;
import com.im.service.IImService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class HeartbeatWsMessageHandler implements WsMessageHandler {

    private static final CloseStatus SEND_FAILED_CLOSE_STATUS =
            CloseStatus.SESSION_NOT_RELIABLE.withReason("send failed");

    private final IImService imService;

    @Override
    public boolean supports(String type) {
        return "HEARTBEAT".equalsIgnoreCase(type) || "PING".equalsIgnoreCase(type);
    }

    @Override
    public void handle(WebSocketSession session, String userId, com.alibaba.fastjson2.JSONObject payload) {
        if (session == null || !session.isOpen()) {
            return;
        }
        try {
            Map<String, String> response = new HashMap<>();
            response.put("type", "HEARTBEAT");
            response.put("content", "PONG");
            session.sendMessage(new TextMessage(JSON.toJSONString(response)));
        } catch (Exception e) {
            handleSendFailure(session, userId, e);
        }
    }

    private void handleSendFailure(WebSocketSession session, String userId, Exception sendError) {
        String sessionId = session == null ? null : session.getId();
        log.warn("WebSocket heartbeat response send failed. userId={}, sessionId={}, closeStatus={}, error={}",
                userId, sessionId, SEND_FAILED_CLOSE_STATUS, sendError == null ? null : sendError.getMessage());
        try {
            imService.unregisterSession(userId, sessionId, SEND_FAILED_CLOSE_STATUS);
        } catch (Exception cleanupError) {
            log.warn("Cleanup websocket session after heartbeat send failure failed. userId={}, sessionId={}, closeStatus={}, error={}",
                    userId, sessionId, SEND_FAILED_CLOSE_STATUS, cleanupError.getMessage());
        }
    }
}
