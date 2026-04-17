package com.im.task;

import com.im.entity.UserSession;
import com.im.service.IImService;
import com.im.websocket.WebSocketErrorSemantics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketSessionCleanupTask {

    private final IImService imService;

    @Scheduled(fixedDelayString = "${im.websocket.cleanup-interval-ms:60000}")
    public void cleanupInactiveSessions() {
        for (Map.Entry<String, UserSession> entry : imService.getSessionsById().entrySet()) {
            String sessionId = entry.getKey();
            UserSession userSession = entry.getValue();
            if (userSession == null) {
                continue;
            }
            String userId = userSession.getUserId();
            if (imService.isSessionActive(userId, sessionId)) {
                continue;
            }
            imService.unregisterSession(userId, sessionId, WebSocketErrorSemantics.SESSION_CLOSED_OR_STALE);
        }
    }
}
