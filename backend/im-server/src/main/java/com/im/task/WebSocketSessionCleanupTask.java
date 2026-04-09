package com.im.task;

import com.im.entity.UserSession;
import com.im.service.IImService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;

import java.time.LocalDateTime;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketSessionCleanupTask {

    private final IImService imService;

    @Value("${im.heartbeat.timeout:90000}")
    private long heartbeatTimeoutMs;

    @Scheduled(fixedDelayString = "${im.websocket.cleanup-interval-ms:60000}")
    public void cleanupInactiveSessions() {
        LocalDateTime cutoffTime = LocalDateTime.now().minusNanos(Math.max(1000L, heartbeatTimeoutMs) * 1_000_000);
        for (Map.Entry<String, UserSession> entry : imService.getSessionsById().entrySet()) {
            String sessionId = entry.getKey();
            UserSession userSession = entry.getValue();
            if (userSession == null || userSession.getLastHeartbeat() == null) {
                continue;
            }
            if (userSession.getLastHeartbeat().isAfter(cutoffTime)) {
                continue;
            }
            imService.unregisterSession(userSession.getUserId(), sessionId, CloseStatus.GOING_AWAY.withReason("session timeout"));
        }
    }
}
