package com.im.task;

import com.im.entity.UserSession;
import com.im.service.IImService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import java.time.LocalDateTime;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketSessionCleanupTask {

    private final IImService imService;

    @Scheduled(fixedDelayString = "${im.websocket.cleanup-interval-ms:60000}")
    public void cleanupInactiveSessions() {
        LocalDateTime cutoffTime = LocalDateTime.now().minusMinutes(5);
        Map<String, UserSession> sessionMap = imService.getSessionUserMap();

        for (Map.Entry<String, UserSession> entry : sessionMap.entrySet()) {
            String userId = entry.getKey();
            UserSession userSession = entry.getValue();
            if (userSession == null || userSession.getLastHeartbeat() == null) {
                continue;
            }
            if (userSession.getLastHeartbeat().isAfter(cutoffTime)) {
                continue;
            }

            WebSocketSession webSocketSession = userSession.getWebSocketSession();
            if (webSocketSession != null && webSocketSession.isOpen()) {
                try {
                    webSocketSession.close(CloseStatus.GOING_AWAY.withReason("会话超时"));
                } catch (Exception e) {
                    log.debug("关闭超时会话失败: userId={}", userId, e);
                }
            }
            imService.removeSessionMapping(userId);
        }
    }
}

