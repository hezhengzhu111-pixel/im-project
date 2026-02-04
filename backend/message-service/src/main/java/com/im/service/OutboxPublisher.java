package com.im.service;

import com.im.entity.MessageOutboxEvent;
import com.im.mapper.MessageOutboxMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class OutboxPublisher {

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final MessageOutboxMapper outboxMapper;

    @Value("${im.outbox.max-attempts:20}")
    private int maxAttempts;

    @Value("${im.outbox.batch-size:100}")
    private int batchSize;

    @Value("${im.outbox.base-backoff-ms:1000}")
    private long baseBackoffMs;

    public void publishById(Long outboxId) {
        if (outboxId == null) {
            return;
        }
        MessageOutboxEvent event = outboxMapper.selectById(outboxId);
        if (event == null) {
            return;
        }
        if ("SENT".equals(event.getStatus())) {
            return;
        }
        if (event.getAttempts() != null && event.getAttempts() >= maxAttempts) {
            return;
        }

        kafkaTemplate.send(event.getTopic(), event.getMessageKey(), event.getPayload())
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        markFailed(outboxId, ex);
                        return;
                    }
                    markSent(outboxId);
                });
    }

    @Scheduled(fixedDelayString = "${im.outbox.retry-interval-ms:5000}")
    public void retryDueEvents() {
        List<MessageOutboxEvent> dueEvents = outboxMapper.selectDueEvents(LocalDateTime.now(), batchSize);
        for (MessageOutboxEvent event : dueEvents) {
            publishById(event.getId());
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markSent(Long outboxId) {
        MessageOutboxEvent event = outboxMapper.selectById(outboxId);
        if (event == null) {
            return;
        }
        event.setStatus("SENT");
        event.setLastError(null);
        event.setNextRetryAt(LocalDateTime.now());
        outboxMapper.updateById(event);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(Long outboxId, Throwable ex) {
        MessageOutboxEvent event = outboxMapper.selectById(outboxId);
        if (event == null) {
            return;
        }
        int attempts = event.getAttempts() == null ? 0 : event.getAttempts();
        attempts += 1;
        event.setAttempts(attempts);
        event.setStatus("FAILED");
        event.setLastError(ex == null ? "unknown" : String.valueOf(ex.getMessage()));
        event.setNextRetryAt(LocalDateTime.now().plusNanos(calculateBackoffMs(attempts) * 1_000_000));
        outboxMapper.updateById(event);
        log.warn("Outbox发送失败: id={}, attempts={}, topic={}, err={}", outboxId, attempts, event.getTopic(), event.getLastError());
    }

    private long calculateBackoffMs(int attempts) {
        long multiplier = 1L << Math.min(10, Math.max(0, attempts - 1));
        return baseBackoffMs * multiplier;
    }
}
