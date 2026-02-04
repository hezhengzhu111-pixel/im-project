package com.im.service;

import com.im.entity.MessageOutboxEvent;
import com.im.mapper.MessageOutboxMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class OutboxService {

    private final MessageOutboxMapper outboxMapper;
    private final OutboxPublisher outboxPublisher;

    public void enqueueAfterCommit(String topic, String key, String payload, Long relatedMessageId) {
        MessageOutboxEvent event = new MessageOutboxEvent();
        event.setTopic(topic);
        event.setMessageKey(key);
        event.setPayload(payload);
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
}
