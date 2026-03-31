package com.im.service;

import com.im.entity.MessageOutboxEvent;
import com.im.mapper.MessageOutboxMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class OutboxService {

    private final MessageOutboxMapper outboxMapper;
    private final OutboxPublisher outboxPublisher;

    public void enqueueAfterCommit(String topic,
                                   String eventType,
                                   String key,
                                   String payload,
                                   Long relatedMessageId,
                                   List<Long> targetUserIds) {
        MessageOutboxEvent event = new MessageOutboxEvent();
        event.setTopic(topic);
        event.setMessageKey(key);
        event.setPayload(payload);
        event.setEventType(eventType);
        event.setTargetsJson(com.alibaba.fastjson2.JSON.toJSONString(targetUserIds == null ? List.of() : targetUserIds));
        event.setRelatedMessageId(relatedMessageId);
        event.setStatus("PENDING");
        event.setAttempts(0);
        event.setNextRetryAt(LocalDateTime.now());
        outboxMapper.insert(event);

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    outboxPublisher.publishById(event.getId());
                }
            });
            return;
        }
        outboxPublisher.publishById(event.getId());
    }

    public void enqueueAfterCommit(MessageOutboxEvent source) {
        if (source == null) {
            return;
        }
        enqueueAfterCommit(
                source.getTopic(),
                source.getEventType(),
                source.getMessageKey(),
                source.getPayload(),
                source.getRelatedMessageId(),
                com.alibaba.fastjson2.JSON.parseArray(source.getTargetsJson(), Long.class)
        );
    }
}
