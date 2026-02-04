package com.im.task;

import com.im.entity.UserSession;
import com.im.service.IImService;
import com.im.service.MessageRetryQueue;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executor;

@Slf4j
@Component
@RequiredArgsConstructor
public class MessageRetryTask {

    private final IImService imService;
    private final MessageRetryQueue retryQueue;

    @Qualifier("imServerExecutor")
    private final Executor imServerExecutor;

    @Scheduled(fixedDelayString = "${im.retry.push-interval-ms:1000}")
    public void retryPush() {
        for (var entry : imService.getSessionUserMap().entrySet()) {
            String userId = entry.getKey();
            UserSession session = entry.getValue();
            if (session == null || session.getWebSocketSession() == null || !session.getWebSocketSession().isOpen()) {
                continue;
            }

            try {
                imServerExecutor.execute(() -> drainAndSend(userId, session));
            } catch (Exception e) {
                log.warn("WebSocket重试任务提交失败: userId={}, error={}", userId, e.getMessage());
            }
        }
    }

    private void drainAndSend(String userId, UserSession session) {
        for (int i = 0; i < 20; i++) {
            MessageRetryQueue.RetryItem item = retryQueue.pollReady(userId);
            if (item == null) {
                return;
            }
            try {
                Map<String, Object> wsMessage = new HashMap<>();
                wsMessage.put("type", "MESSAGE");
                wsMessage.put("data", item.getMessage());
                wsMessage.put("timestamp", System.currentTimeMillis());
                String payload = com.alibaba.fastjson2.JSON.toJSONString(wsMessage, com.alibaba.fastjson2.JSONWriter.Feature.WriteLongAsString);
                session.getWebSocketSession().sendMessage(new TextMessage(payload));
            } catch (Exception e) {
                retryQueue.requeue(item, e.getMessage());
                log.debug("WebSocket重试推送失败: userId={}, attempts={}, error={}", userId, item.getAttempts(), e.getMessage());
                return;
            }
        }
    }
}
