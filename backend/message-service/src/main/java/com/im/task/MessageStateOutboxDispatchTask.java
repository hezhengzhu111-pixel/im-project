package com.im.task;

import com.alibaba.fastjson2.JSON;
import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
import com.im.mapper.MessageStateOutboxMapper;
import com.im.message.entity.MessageStateOutbox;
import com.im.service.support.MessageStateOutboxService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Slf4j
@Component
@RequiredArgsConstructor
public class MessageStateOutboxDispatchTask {

    private final MessageStateOutboxMapper messageStateOutboxMapper;
    private final KafkaTemplate<String, ReadEvent> readEventKafkaTemplate;
    private final KafkaTemplate<String, StatusChangeEvent> statusChangeEventKafkaTemplate;

    @Value("${im.kafka.send-timeout-ms:2000}")
    private long kafkaSendTimeoutMs = 2000L;

    @Value("${im.message.state-outbox.dispatch-batch-size:100}")
    private int dispatchBatchSize = 100;

    @Value("${im.message.state-outbox.retry-delay-ms:1000}")
    private long retryDelayMs = 1000L;

    @Value("${im.message.state-outbox.retry-max-delay-ms:30000}")
    private long retryMaxDelayMs = 30000L;

    @Value("${im.message.state-outbox.dispatch-lease-ms:5000}")
    private long dispatchLeaseMs = 5000L;

    @Scheduled(
            fixedDelayString = "${im.message.state-outbox.dispatch-fixed-delay-ms:1000}",
            initialDelayString = "${im.message.state-outbox.dispatch-initial-delay-ms:1000}"
    )
    public void dispatchPendingOutbox() {
        List<MessageStateOutbox> outboxes = messageStateOutboxMapper.selectDispatchableBatch(
                LocalDateTime.now(),
                Math.max(1, dispatchBatchSize)
        );
        if (outboxes == null || outboxes.isEmpty()) {
            return;
        }
        for (MessageStateOutbox outbox : outboxes) {
            if (outbox == null) {
                continue;
            }
            dispatchOutbox(outbox);
        }
    }

    void dispatchOutbox(MessageStateOutbox outbox) {
        LocalDateTime now = LocalDateTime.now();
        int claimed = messageStateOutboxMapper.markDispatchingById(
                outbox.getId(),
                now,
                now.plusNanos(TimeUnit.MILLISECONDS.toNanos(Math.max(1L, dispatchLeaseMs)))
        );
        if (claimed <= 0) {
            return;
        }
        try {
            if (MessageStateOutboxService.EVENT_TYPE_READ.equals(outbox.getEventType())) {
                ReadEvent readEvent = deserializeReadEvent(outbox);
                if (readEvent == null) {
                    markRetry(outbox, new IllegalArgumentException("invalid read event payload"));
                    return;
                }
                readEventKafkaTemplate.send(resolveTopic(outbox), resolveRoutingKey(outbox), readEvent)
                        .get(Math.max(1L, kafkaSendTimeoutMs), TimeUnit.MILLISECONDS);
            } else if (MessageStateOutboxService.EVENT_TYPE_STATUS_CHANGE.equals(outbox.getEventType())) {
                StatusChangeEvent statusChangeEvent = deserializeStatusChangeEvent(outbox);
                if (statusChangeEvent == null) {
                    markRetry(outbox, new IllegalArgumentException("invalid status change payload"));
                    return;
                }
                statusChangeEventKafkaTemplate.send(resolveTopic(outbox), resolveRoutingKey(outbox), statusChangeEvent)
                        .get(Math.max(1L, kafkaSendTimeoutMs), TimeUnit.MILLISECONDS);
            } else {
                markRetry(outbox, new IllegalArgumentException("unsupported state outbox event type"));
                return;
            }
            messageStateOutboxMapper.markDispatchedById(outbox.getId(), LocalDateTime.now());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            markRetry(outbox, exception);
        } catch (ExecutionException | TimeoutException exception) {
            markRetry(outbox, exception);
        } catch (RuntimeException exception) {
            markRetry(outbox, exception);
        }
    }

    private ReadEvent deserializeReadEvent(MessageStateOutbox outbox) {
        try {
            return JSON.parseObject(outbox.getPayloadJson(), ReadEvent.class);
        } catch (Exception exception) {
            log.warn("Failed to deserialize read state outbox payload. outboxId={}", outbox.getId(), exception);
            return null;
        }
    }

    private StatusChangeEvent deserializeStatusChangeEvent(MessageStateOutbox outbox) {
        try {
            return JSON.parseObject(outbox.getPayloadJson(), StatusChangeEvent.class);
        } catch (Exception exception) {
            log.warn("Failed to deserialize status state outbox payload. outboxId={}", outbox.getId(), exception);
            return null;
        }
    }

    private void markRetry(MessageStateOutbox outbox, Exception exception) {
        long delayMs = computeRetryDelayMs(outbox);
        messageStateOutboxMapper.markRetryById(
                outbox.getId(),
                LocalDateTime.now().plusNanos(TimeUnit.MILLISECONDS.toNanos(delayMs)),
                summarize(exception)
        );
        log.warn("Failed to dispatch state outbox, will retry. outboxId={}, eventType={}, error={}",
                outbox.getId(), outbox.getEventType(), summarize(exception));
    }

    private long computeRetryDelayMs(MessageStateOutbox outbox) {
        int attempt = outbox == null || outbox.getAttemptCount() == null ? 1 : Math.max(1, outbox.getAttemptCount() + 1);
        long delayMs = Math.max(1L, retryDelayMs);
        for (int index = 1; index < attempt; index++) {
            if (delayMs >= retryMaxDelayMs) {
                return Math.max(1L, retryMaxDelayMs);
            }
            delayMs = Math.min(Math.max(1L, retryMaxDelayMs), delayMs * 2L);
        }
        return Math.max(1L, delayMs);
    }

    private String resolveTopic(MessageStateOutbox outbox) {
        return outbox != null && StringUtils.hasText(outbox.getTopic()) ? outbox.getTopic().trim() : null;
    }

    private String resolveRoutingKey(MessageStateOutbox outbox) {
        return outbox != null && StringUtils.hasText(outbox.getRoutingKey()) ? outbox.getRoutingKey().trim() : null;
    }

    private String summarize(Exception exception) {
        if (exception == null) {
            return "dispatch failed";
        }
        String message = exception.getMessage();
        if (!StringUtils.hasText(message)) {
            return exception.getClass().getSimpleName();
        }
        String normalized = message.trim();
        return normalized.length() > 200 ? normalized.substring(0, 200) : normalized;
    }
}
