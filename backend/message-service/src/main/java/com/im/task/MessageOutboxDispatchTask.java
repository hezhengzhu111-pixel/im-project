package com.im.task;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageEvent;
import com.im.mapper.MessageOutboxMapper;
import com.im.message.entity.MessageOutbox;
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
public class MessageOutboxDispatchTask {

    private final MessageOutboxMapper messageOutboxMapper;
    private final KafkaTemplate<String, MessageEvent> kafkaTemplate;

    @Value("${im.kafka.send-timeout-ms:2000}")
    private long kafkaSendTimeoutMs = 2000L;

    @Value("${im.message.outbox.dispatch-batch-size:100}")
    private int dispatchBatchSize = 100;

    @Value("${im.message.outbox.retry-delay-ms:1000}")
    private long retryDelayMs = 1000L;

    @Scheduled(
            fixedDelayString = "${im.message.outbox.dispatch-fixed-delay-ms:1000}",
            initialDelayString = "${im.message.outbox.dispatch-initial-delay-ms:1000}"
    )
    public void dispatchPendingOutbox() {
        List<MessageOutbox> outboxes = messageOutboxMapper.selectDispatchableBatch(LocalDateTime.now(), Math.max(1, dispatchBatchSize));
        if (outboxes == null || outboxes.isEmpty()) {
            return;
        }
        for (MessageOutbox outbox : outboxes) {
            if (outbox == null) {
                continue;
            }
            dispatchOutbox(outbox);
        }
    }

    void dispatchOutbox(MessageOutbox outbox) {
        MessageEvent event = deserializeEvent(outbox);
        if (event == null) {
            messageOutboxMapper.markRetryById(
                    outbox.getId(),
                    LocalDateTime.now().plusNanos(TimeUnit.MILLISECONDS.toNanos(Math.max(1L, retryDelayMs))),
                    "invalid event payload"
            );
            return;
        }
        try {
            kafkaTemplate.send(resolveTopic(outbox), resolveRoutingKey(outbox, event), event)
                    .get(Math.max(1L, kafkaSendTimeoutMs), TimeUnit.MILLISECONDS);
            messageOutboxMapper.markDispatchedById(outbox.getId(), LocalDateTime.now());
            log.info("Dispatched message outbox to Kafka. messageId={}, conversationId={}",
                    outbox.getId(), outbox.getConversationId());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            markRetry(outbox, exception);
        } catch (ExecutionException | TimeoutException exception) {
            markRetry(outbox, exception);
        } catch (RuntimeException exception) {
            markRetry(outbox, exception);
        }
    }

    private MessageEvent deserializeEvent(MessageOutbox outbox) {
        if (outbox == null || !StringUtils.hasText(outbox.getEventJson())) {
            return null;
        }
        try {
            return JSON.parseObject(outbox.getEventJson(), MessageEvent.class);
        } catch (Exception exception) {
            log.warn("Failed to deserialize message outbox payload. messageId={}", outbox.getId(), exception);
            return null;
        }
    }

    private void markRetry(MessageOutbox outbox, Exception exception) {
        messageOutboxMapper.markRetryById(
                outbox.getId(),
                LocalDateTime.now().plusNanos(TimeUnit.MILLISECONDS.toNanos(Math.max(1L, retryDelayMs))),
                summarize(exception)
        );
        log.warn("Failed to dispatch message outbox, will retry. messageId={}, conversationId={}, error={}",
                outbox.getId(), outbox.getConversationId(), summarize(exception));
    }

    private String resolveTopic(MessageOutbox outbox) {
        if (outbox != null && StringUtils.hasText(outbox.getTopic())) {
            return outbox.getTopic().trim();
        }
        return "im-chat-topic";
    }

    private String resolveRoutingKey(MessageOutbox outbox, MessageEvent event) {
        if (outbox != null && StringUtils.hasText(outbox.getRoutingKey())) {
            return outbox.getRoutingKey().trim();
        }
        return event == null ? null : event.getConversationId();
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
