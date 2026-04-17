package com.im.consumer;

import com.im.dto.MessageEvent;
import com.im.dto.StatusChangeEvent;
import com.im.enums.MessageEventType;
import com.im.message.entity.Message;
import com.im.service.MessagePersistenceService;
import com.im.service.support.AcceptedMessageProjectionService;
import com.im.service.support.PendingStatusEventService;
import com.im.service.support.PersistenceWatermarkService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Component
@RequiredArgsConstructor
public class KafkaMessagePersister {

    private final MessagePersistenceService messagePersistenceService;
    private final PersistenceWatermarkService persistenceWatermarkService;
    private final PendingStatusEventService pendingStatusEventService;
    private final KafkaMessageStatePersister kafkaMessageStatePersister;
    private final AcceptedMessageProjectionService acceptedMessageProjectionService;

    @KafkaListener(
            topics = "${im.kafka.chat-topic:im-chat-topic}",
            groupId = "im-db-persister",
            containerFactory = "messageEventBatchKafkaListenerContainerFactory"
    )
    public void persistMessages(List<ConsumerRecord<String, MessageEvent>> records) {
        KafkaMessagePersistBatchResult result = persistMessageBatch(records);
        if (result.hasRetryableFailures()) {
            throw new IllegalStateException("retryable kafka message persistence failures: " + result.summary());
        }
    }

    KafkaMessagePersistBatchResult persistMessageBatch(List<ConsumerRecord<String, MessageEvent>> records) {
        KafkaMessagePersistBatchResult.Builder resultBuilder =
                KafkaMessagePersistBatchResult.builder(records == null ? 0 : records.size());
        if (records == null || records.isEmpty()) {
            return resultBuilder.build();
        }

        List<PersistCandidate> candidates = collectPersistCandidates(records, resultBuilder);
        if (candidates.isEmpty()) {
            KafkaMessagePersistBatchResult emptyResult = resultBuilder.build();
            logBatchResult(emptyResult);
            return emptyResult;
        }

        try {
            saveBatch(candidates);
            for (PersistCandidate candidate : candidates) {
                markPersistedCandidate(candidate);
                resultBuilder.addSuccess(candidate.detail(null));
            }
        } catch (Exception exception) {
            if (isSingleRowFallbackBatchException(exception)) {
                saveIndividually(candidates, resultBuilder);
            } else {
                markRetryableBatch(candidates, resultBuilder, summarize(exception));
            }
        }

        KafkaMessagePersistBatchResult result = resultBuilder.build();
        logBatchResult(result);
        return result;
    }

    private List<PersistCandidate> collectPersistCandidates(List<ConsumerRecord<String, MessageEvent>> records,
                                                            KafkaMessagePersistBatchResult.Builder resultBuilder) {
        List<PersistCandidate> candidates = new ArrayList<>();
        for (ConsumerRecord<String, MessageEvent> record : records) {
            if (record == null) {
                continue;
            }
            MessageEvent event = record.value();
            if (event == null || event.getEventType() != MessageEventType.MESSAGE) {
                continue;
            }
            resultBuilder.incrementMessageCount();
            try {
                String conversationId = resolveConversationId(event);
                Message message = toMessage(event);
                candidates.add(new PersistCandidate(record.partition(), record.offset(), conversationId, event, message));
            } catch (Exception exception) {
                resultBuilder.addPoison(detail(record, event, summarize(exception)));
            }
        }
        return candidates;
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
        if (event == null || event.getMessageId() == null) {
            throw new IllegalArgumentException("messageId cannot be null");
        }
        return event.getMessageId();
    }

    private String resolveClientMessageId(MessageEvent event) {
        if (event == null) {
            return null;
        }
        if (StringUtils.hasText(event.getClientMessageId())) {
            return event.getClientMessageId().trim();
        }
        if (StringUtils.hasText(event.getClientMsgId())) {
            return event.getClientMsgId().trim();
        }
        return null;
    }

    private void saveBatch(List<PersistCandidate> candidates) {
        List<Message> messages = candidates.stream().map(PersistCandidate::message).toList();
        boolean saved = messagePersistenceService.saveBatch(messages);
        if (!saved) {
            throw new IllegalStateException("saveBatch returned false");
        }
    }

    private void saveIndividually(List<PersistCandidate> candidates,
                                  KafkaMessagePersistBatchResult.Builder resultBuilder) {
        Set<Integer> blockedPartitions = new HashSet<>();
        Map<Integer, KafkaMessagePersistBatchResult.Detail> retryBarrierByPartition = new HashMap<>();
        for (PersistCandidate candidate : candidates) {
            if (blockedPartitions.contains(candidate.partition())) {
                KafkaMessagePersistBatchResult.Detail retryBarrier = retryBarrierByPartition.get(candidate.partition());
                String barrierReason = retryBarrier == null
                        ? "deferred after earlier retryable record in same partition"
                        : "deferred after retryable record offset=" + retryBarrier.offset();
                resultBuilder.addRetryable(candidate.detail(barrierReason));
                continue;
            }
            try {
                boolean saved = messagePersistenceService.save(candidate.message());
                if (!saved) {
                    throw new IllegalStateException("save returned false");
                }
                markPersistedCandidate(candidate);
                resultBuilder.addSuccess(candidate.detail(null));
            } catch (DuplicateKeyException duplicate) {
                markPersistedCandidate(candidate);
                resultBuilder.addDuplicate(candidate.detail(summarize(duplicate)));
            } catch (Exception exception) {
                if (isPoisonRecordException(exception)) {
                    resultBuilder.addPoison(candidate.detail(summarize(exception)));
                    continue;
                }
                KafkaMessagePersistBatchResult.Detail retryableDetail = candidate.detail(summarize(exception));
                resultBuilder.addRetryable(retryableDetail);
                blockedPartitions.add(candidate.partition());
                retryBarrierByPartition.put(candidate.partition(), retryableDetail);
            }
        }
    }

    private void markRetryableBatch(List<PersistCandidate> candidates,
                                    KafkaMessagePersistBatchResult.Builder resultBuilder,
                                    String reason) {
        for (PersistCandidate candidate : candidates) {
            resultBuilder.addRetryable(candidate.detail(reason));
        }
    }

    private void markPersistedCandidate(PersistCandidate candidate) {
        persistenceWatermarkService.markPersisted(candidate.conversationId(), candidate.message().getId());
        finalizeAcceptedAndOutbox(candidate.event());
        replayPendingStatusEvents(candidate.message().getId());
    }

    private void replayPendingStatusEvents(Long messageId) {
        if (messageId == null) {
            return;
        }
        List<StatusChangeEvent> pendingEvents = pendingStatusEventService.listByMessageId(messageId);
        if (pendingEvents == null || pendingEvents.isEmpty()) {
            return;
        }
        for (StatusChangeEvent pendingEvent : pendingEvents) {
            if (pendingEvent == null) {
                continue;
            }
            try {
                kafkaMessageStatePersister.persistStatusChangeEvent(pendingEvent);
            } catch (Exception exception) {
                log.warn("Immediate pending status replay failed after message persistence. messageId={}, status={}, error={}",
                        messageId, pendingEvent.getNewStatus(), exception.getMessage(), exception);
            }
        }
    }

    private void finalizeAcceptedAndOutbox(MessageEvent event) {
        if (event == null) {
            return;
        }
        try {
            acceptedMessageProjectionService.markPersisted(event);
        } catch (Exception exception) {
            log.warn("Failed to promote accepted/outbox ack stage after persistence. messageId={}",
                    event.getMessageId(), exception);
        }
    }

    private boolean isSingleRowFallbackBatchException(Exception exception) {
        return exception instanceof DuplicateKeyException
                || exception instanceof DataIntegrityViolationException
                || exception instanceof InvalidDataAccessApiUsageException;
    }

    private boolean isPoisonRecordException(Exception exception) {
        return exception instanceof DataIntegrityViolationException
                || exception instanceof InvalidDataAccessApiUsageException
                || exception instanceof IllegalArgumentException;
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

    private KafkaMessagePersistBatchResult.Detail detail(ConsumerRecord<String, MessageEvent> record,
                                                         MessageEvent event,
                                                         String reason) {
        return new KafkaMessagePersistBatchResult.Detail(
                record == null ? -1 : record.partition(),
                record == null ? -1L : record.offset(),
                event == null ? null : event.getMessageId(),
                resolveClientMessageId(event),
                safeConversationId(event),
                reason
        );
    }

    private String safeConversationId(MessageEvent event) {
        if (event == null) {
            return null;
        }
        if (StringUtils.hasText(event.getConversationId())) {
            return event.getConversationId().trim();
        }
        if (event.getGroupId() != null || Boolean.TRUE.equals(event.getGroup())) {
            return event.getGroupId() == null ? null : "g_" + event.getGroupId();
        }
        if (event.getSenderId() == null || event.getReceiverId() == null) {
            return null;
        }
        long min = Math.min(event.getSenderId(), event.getReceiverId());
        long max = Math.max(event.getSenderId(), event.getReceiverId());
        return "p_" + min + "_" + max;
    }

    private String summarize(Exception exception) {
        if (exception == null) {
            return "unknown";
        }
        Throwable root = exception;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        String message = root.getMessage();
        if (!StringUtils.hasText(message)) {
            message = exception.getMessage();
        }
        String normalizedMessage = StringUtils.hasText(message) ? message.trim() : exception.getClass().getSimpleName();
        if (normalizedMessage.length() > 200) {
            normalizedMessage = normalizedMessage.substring(0, 200);
        }
        return root.getClass().getSimpleName() + ":" + normalizedMessage;
    }

    private void logBatchResult(KafkaMessagePersistBatchResult result) {
        if (result.getMessageCount() == 0) {
            log.debug("No message events to persist. recordCount={}", result.getRecordCount());
            return;
        }
        String summary = result.summary();
        if (result.hasRetryableFailures()) {
            log.warn("Kafka message batch persisted with retryable remainder. {}", summary);
            return;
        }
        if (result.getPoisonCount() > 0 || result.getDuplicateCount() > 0) {
            log.warn("Kafka message batch persisted with isolated records. {}", summary);
            return;
        }
        log.info("Persisted Kafka message batch. {}", summary);
    }

    private record PersistCandidate(int partition,
                                    long offset,
                                    String conversationId,
                                    MessageEvent event,
                                    Message message) {

        KafkaMessagePersistBatchResult.Detail detail(String reason) {
            return new KafkaMessagePersistBatchResult.Detail(
                    partition,
                    offset,
                    event == null ? null : event.getMessageId(),
                    message == null ? null : message.getClientMessageId(),
                    conversationId,
                    reason
            );
        }
    }
}
