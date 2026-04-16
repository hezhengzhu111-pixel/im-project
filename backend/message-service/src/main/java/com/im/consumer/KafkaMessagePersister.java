package com.im.consumer;

import com.im.dto.MessageEvent;
import com.im.enums.MessageEventType;
import com.im.message.entity.Message;
import com.im.service.MessagePersistenceService;
import com.im.service.support.PersistenceWatermarkService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Slf4j
@Component
@RequiredArgsConstructor
public class KafkaMessagePersister {

    private final MessagePersistenceService messagePersistenceService;
    private final PersistenceWatermarkService persistenceWatermarkService;

    @KafkaListener(
            topics = "${im.kafka.chat-topic:im-chat-topic}",
            groupId = "im-db-persister",
            containerFactory = "messageEventBatchKafkaListenerContainerFactory"
    )
    public void persistMessages(List<ConsumerRecord<String, MessageEvent>> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        List<PersistCandidate> candidates = records.stream()
                .map(ConsumerRecord::value)
                .filter(Objects::nonNull)
                .filter(event -> event.getEventType() == MessageEventType.MESSAGE)
                .map(event -> new PersistCandidate(event, toMessage(event)))
                .toList();
        if (candidates.isEmpty()) {
            log.debug("No message events to persist. recordCount={}", records.size());
            return;
        }

        try {
            List<PersistCandidate> persistedCandidates = saveBatch(candidates);
            markPersistedBatch(persistedCandidates);
            log.info("Persisted Kafka message batch. recordCount={}, messageCount={}",
                    records.size(), persistedCandidates.size());
        } catch (DuplicateKeyException duplicate) {
            List<PersistOutcome> persistedCandidates = saveIndividually(candidates);
            markPersistedOutcomes(persistedCandidates);
            log.debug("Handled duplicate Kafka message batch with single-row fallback. recordCount={}, messageCount={}, persistedCount={}",
                    records.size(), candidates.size(), countPersisted(persistedCandidates));
        } catch (Exception exception) {
            log.error("Failed to persist Kafka message batch. recordCount={}, messageCount={}",
                    records.size(), candidates.size(), exception);
            throw exception;
        }
    }

    private Message toMessage(MessageEvent event) {
        Message message = new Message();
        message.setId(requireMessageId(event));
        message.setSenderId(event.getSenderId());
        message.setReceiverId(event.getReceiverId());
        message.setGroupId(event.getGroupId());
        message.setClientMessageId(resolveClientMessageId(event));
        message.setMessageType(event.getMessageType());
        message.setContent(event.getContent());
        message.setMediaUrl(event.getMediaUrl());
        message.setMediaSize(event.getMediaSize());
        message.setMediaName(event.getMediaName());
        message.setThumbnailUrl(event.getThumbnailUrl());
        message.setDuration(event.getDuration());
        message.setLocationInfo(event.getLocationInfo());
        message.setStatus(event.getStatus() == null ? Message.MessageStatus.SENT : event.getStatus());
        message.setIsGroupChat(Boolean.TRUE.equals(event.getGroup()) || event.getGroupId() != null);
        message.setReplyToMessageId(event.getReplyToMessageId());
        message.setCreatedTime(event.getCreatedTime() == null ? LocalDateTime.now() : event.getCreatedTime());
        message.setUpdatedTime(event.getUpdatedTime() == null ? message.getCreatedTime() : event.getUpdatedTime());
        return message;
    }

    private Long requireMessageId(MessageEvent event) {
        if (event.getMessageId() == null) {
            throw new IllegalArgumentException("messageId cannot be null");
        }
        return event.getMessageId();
    }

    private String resolveClientMessageId(MessageEvent event) {
        if (StringUtils.hasText(event.getClientMessageId())) {
            return event.getClientMessageId().trim();
        }
        if (StringUtils.hasText(event.getClientMsgId())) {
            return event.getClientMsgId().trim();
        }
        return null;
    }

    private List<PersistCandidate> saveBatch(List<PersistCandidate> candidates) {
        List<Message> messages = candidates.stream().map(PersistCandidate::message).toList();
        boolean saved = messagePersistenceService.saveBatch(messages);
        if (!saved) {
            throw new IllegalStateException("saveBatch returned false");
        }
        return candidates;
    }

    private List<PersistOutcome> saveIndividually(List<PersistCandidate> candidates) {
        List<PersistOutcome> persisted = new ArrayList<>();
        for (PersistCandidate candidate : candidates) {
            try {
                boolean saved = messagePersistenceService.save(candidate.message());
                if (!saved) {
                    throw new IllegalStateException("save returned false");
                }
                persisted.add(new PersistOutcome(candidate.event(), candidate.message(), true));
            } catch (DuplicateKeyException duplicate) {
                log.debug("Treat duplicate Kafka message event as already persisted. messageId={}, clientMessageId={}",
                        candidate.message().getId(), candidate.message().getClientMessageId());
                persisted.add(new PersistOutcome(candidate.event(), candidate.message(), true));
            }
        }
        return persisted;
    }

    private void markPersistedBatch(List<PersistCandidate> candidates) {
        for (PersistCandidate candidate : candidates) {
            persistenceWatermarkService.markPersisted(
                    resolveConversationId(candidate.event()),
                    candidate.message().getId()
            );
        }
    }

    private void markPersistedOutcomes(List<PersistOutcome> outcomes) {
        for (PersistOutcome outcome : outcomes) {
            if (!outcome.persistedOrAlreadyExists()) {
                continue;
            }
            persistenceWatermarkService.markPersisted(
                    resolveConversationId(outcome.event()),
                    outcome.message().getId()
            );
        }
    }

    private long countPersisted(List<PersistOutcome> outcomes) {
        return outcomes.stream().filter(PersistOutcome::persistedOrAlreadyExists).count();
    }

    private String resolveConversationId(MessageEvent event) {
        if (event == null) {
            throw new IllegalArgumentException("message event cannot be null");
        }
        if (StringUtils.hasText(event.getConversationId())) {
            return event.getConversationId().trim();
        }
        if (event.getGroupId() != null || Boolean.TRUE.equals(event.getGroup())) {
            if (event.getGroupId() == null) {
                throw new IllegalArgumentException("groupId cannot be null for group message");
            }
            return "g_" + event.getGroupId();
        }
        if (event.getSenderId() == null || event.getReceiverId() == null) {
            throw new IllegalArgumentException("senderId and receiverId cannot be null for private message");
        }
        long min = Math.min(event.getSenderId(), event.getReceiverId());
        long max = Math.max(event.getSenderId(), event.getReceiverId());
        return "p_" + min + "_" + max;
    }

    private record PersistCandidate(MessageEvent event, Message message) {
    }

    private record PersistOutcome(MessageEvent event, Message message, boolean persistedOrAlreadyExists) {
    }
}
