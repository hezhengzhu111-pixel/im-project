package com.im.task;

import com.im.service.MessageRetryQueue;
import com.im.service.WsPushEventDispatcher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.Executor;

@Slf4j
@Component
@RequiredArgsConstructor
public class MessageRetryTask {

    private final MessageRetryQueue retryQueue;
    private final WsPushEventDispatcher dispatcher;

    @Qualifier("imServerExecutor")
    private final Executor imServerExecutor;

    @Scheduled(fixedDelayString = "${im.retry.push-interval-ms:1000}")
    public void retryPush() {
        // 每次定时任务尝试处理最多 100 条重试消息
        for (int i = 0; i < 100; i++) {
            MessageRetryQueue.RetryItem item = retryQueue.pollReady();
            if (item == null) {
                break;
            }
            try {
                imServerExecutor.execute(() -> processRetryItem(item));
            } catch (Exception e) {
                log.warn("WebSocket重试任务提交失败: userId={}, error={}", item.getUserId(), e.getMessage());
                retryQueue.requeue(item, "executor_rejected");
            }
        }
    }

    private void processRetryItem(MessageRetryQueue.RetryItem item) {
        try {
            boolean completed = dispatcher.dispatchRetryItem(item);
            if (!completed) {
                retryQueue.requeue(item, "retry_push_failed");
            }
        } catch (Exception e) {
            retryQueue.requeue(item, e.getMessage());
            log.debug("WebSocket重试推送失败: userId={}, attempts={}, error={}",
                    item.getUserId(), item.getAttempts(), e.getMessage());
        }
    }
}
