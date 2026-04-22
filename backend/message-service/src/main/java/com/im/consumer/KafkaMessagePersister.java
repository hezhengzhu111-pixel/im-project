package com.im.consumer;

import com.im.dto.MessageEvent;
import com.im.enums.MessageEventType;
import com.im.message.entity.Message;
import com.im.metrics.MessageServiceMetrics;
import com.im.service.MessagePersistenceService;
import com.im.service.orchestrator.MessageStateOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Component
public class KafkaMessagePersister {

    private static final int NATIVE_PERSIST_BATCH_SIZE = 500;

    private final MessagePersistenceService messagePersistenceService;
    private final MessageStateOrchestrator messageStateOrchestrator;
    private final KafkaTemplate<String, Object> poisonRecordDltKafkaTemplate;
    private final MessageServiceMetrics messageServiceMetrics;

    @Value("${im.kafka.chat-dlt-topic:}")
    private String configuredChatDltTopic;

    public KafkaMessagePersister(MessagePersistenceService messagePersistenceService,
                                 MessageStateOrchestrator messageStateOrchestrator,
                                 @Qualifier("messagePoisonDltKafkaTemplate")
                                 KafkaTemplate<String, Object> poisonRecordDltKafkaTemplate,
                                 MessageServiceMetrics messageServiceMetrics) {
        this.messagePersistenceService = messagePersistenceService;
        this.messageStateOrchestrator = messageStateOrchestrator;
        this.poisonRecordDltKafkaTemplate = poisonRecordDltKafkaTemplate;
        this.messageServiceMetrics = messageServiceMetrics;
    }

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

        persistCandidates(candidates, resultBuilder);

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
            if (event == null) {
                handlePoison(record, null, new IllegalArgumentException("message event cannot be null"), resultBuilder);
                continue;
            }
            if (event.getEventType() == null) {
                handlePoison(record, event, new IllegalArgumentException("message event type cannot be null"), resultBuilder);
                continue;
            }
            if (event.getEventType() != MessageEventType.MESSAGE) {
                continue;
            }
            resultBuilder.incrementMessageCount();
            try {
                validatePersistableEvent(event);
                String conversationId = resolveConversationId(event);
                Message message = toMessage(event);
                candidates.add(new PersistCandidate(
                        record.topic(),
                        record.partition(),
                        record.offset(),
                        conversationId,
                        event,
                        message
                ));
            } catch (Exception exception) {
                handlePoison(record, event, exception, resultBuilder);
            }
        }
        return candidates;
    }

    private void persistCandidates(List<PersistCandidate> candidates,
                                   KafkaMessagePersistBatchResult.Builder resultBuilder) {
        Set<Integer> blockedPartitions = new HashSet<>();
        Map<Integer, KafkaMessagePersistBatchResult.Detail> retryBarrierByPartition = new HashMap<>();
        List<PersistCandidate> chunk = new ArrayList<>(Math.min(candidates.size(), NATIVE_PERSIST_BATCH_SIZE));
        for (PersistCandidate candidate : candidates) {
            if (blockedPartitions.contains(candidate.partition())) {
                deferBlockedCandidate(candidate, resultBuilder, retryBarrierByPartition);
                continue;
            }
            chunk.add(candidate);
            if (chunk.size() == NATIVE_PERSIST_BATCH_SIZE) {
                persistCandidateSlice(chunk, resultBuilder, blockedPartitions, retryBarrierByPartition);
                chunk = new ArrayList<>(NATIVE_PERSIST_BATCH_SIZE);
            }
        }
        if (!chunk.isEmpty()) {
            persistCandidateSlice(chunk, resultBuilder, blockedPartitions, retryBarrierByPartition);
        }
    }

    private void persistCandidateSlice(List<PersistCandidate> candidates,
                                       KafkaMessagePersistBatchResult.Builder resultBuilder,
                                       Set<Integer> blockedPartitions,
                                       Map<Integer, KafkaMessagePersistBatchResult.Detail> retryBarrierByPartition) {
        if (candidates == null || candidates.isEmpty()) {
            return;
        }

        List<PersistCandidate> activeCandidates = new ArrayList<>(candidates.size());
        for (PersistCandidate candidate : candidates) {
            if (blockedPartitions.contains(candidate.partition())) {
                deferBlockedCandidate(candidate, resultBuilder, retryBarrierByPartition);
            } else {
                activeCandidates.add(candidate);
            }
        }
        if (activeCandidates.isEmpty()) {
            return;
        }

        try {
            MessagePersistenceService.BatchPersistResult batchPersistResult =
                    messagePersistenceService.persistIdempotentBatch(activeCandidates.stream()
                            .map(PersistCandidate::message)
                            .toList());
            applyPersistResult(activeCandidates, batchPersistResult, resultBuilder);
        } catch (Exception exception) {
            if (shouldSplitForPoisonIsolation(exception) && activeCandidates.size() > 1) {
                int mid = activeCandidates.size() / 2;
                persistCandidateSlice(new ArrayList<>(activeCandidates.subList(0, mid)),
                        resultBuilder,
                        blockedPartitions,
                        retryBarrierByPartition);
                persistCandidateSlice(new ArrayList<>(activeCandidates.subList(mid, activeCandidates.size())),
                        resultBuilder,
                        blockedPartitions,
                        retryBarrierByPartition);
                return;
            }
            if (isPoisonRecordException(exception) && activeCandidates.size() == 1) {
                handlePoison(activeCandidates.get(0), exception, resultBuilder);
                return;
            }
            markRetryableCandidates(activeCandidates, resultBuilder, blockedPartitions, retryBarrierByPartition, summarize(exception));
        }
    }

    private void applyPersistResult(List<PersistCandidate> candidates,
                                    MessagePersistenceService.BatchPersistResult batchPersistResult,
                                    KafkaMessagePersistBatchResult.Builder resultBuilder) {
        if (batchPersistResult == null || batchPersistResult.size() != candidates.size()) {
            throw new IllegalStateException("batch persist result size mismatch");
        }
        for (int i = 0; i < candidates.size(); i++) {
            PersistCandidate candidate = candidates.get(i);
            MessagePersistenceService.PersistDisposition disposition = batchPersistResult.dispositionAt(i);
            if (disposition == MessagePersistenceService.PersistDisposition.DUPLICATE) {
                markPersistedCandidate(candidate);
                resultBuilder.addDuplicate(candidate.detail("idempotent duplicate"));
                continue;
            }
            markPersistedCandidate(candidate);
            resultBuilder.addSuccess(candidate.detail(null));
        }
    }

    private void markRetryableCandidates(List<PersistCandidate> candidates,
                                         KafkaMessagePersistBatchResult.Builder resultBuilder,
                                         Set<Integer> blockedPartitions,
                                         Map<Integer, KafkaMessagePersistBatchResult.Detail> retryBarrierByPartition,
                                         String reason) {
        for (PersistCandidate candidate : candidates) {
            KafkaMessagePersistBatchResult.Detail detail = candidate.detail(reason);
            addRetryable(resultBuilder, detail);
            blockedPartitions.add(candidate.partition());
            retryBarrierByPartition.putIfAbsent(candidate.partition(), detail);
        }
    }

    private void deferBlockedCandidate(PersistCandidate candidate,
                                       KafkaMessagePersistBatchResult.Builder resultBuilder,
                                       Map<Integer, KafkaMessagePersistBatchResult.Detail> retryBarrierByPartition) {
        KafkaMessagePersistBatchResult.Detail retryBarrier = retryBarrierByPartition.get(candidate.partition());
        String barrierReason = retryBarrier == null
                ? "deferred after earlier retryable record in same partition"
                : "deferred after retryable record offset=" + retryBarrier.offset();
        addRetryable(resultBuilder, candidate.detail(barrierReason));
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

    private void validatePersistableEvent(MessageEvent event) {
        requireMessageId(event);
        if (Boolean.TRUE.equals(event.getGroup()) || event.getGroupId() != null) {
            if (event.getGroupId() == null) {
                throw new IllegalArgumentException("groupId cannot be null for group message");
            }
            return;
        }
        if (event.getSenderId() == null || event.getReceiverId() == null) {
            throw new IllegalArgumentException("senderId and receiverId cannot be null for private message");
        }
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

    private boolean shouldSplitForPoisonIsolation(Exception exception) {
        return exception instanceof DataIntegrityViolationException
                || exception instanceof InvalidDataAccessApiUsageException
                || exception instanceof IllegalArgumentException;
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

    private void handlePoison(ConsumerRecord<String, MessageEvent> record,
                              MessageEvent event,
                              Exception exception,
                              KafkaMessagePersistBatchResult.Builder resultBuilder) {
        PoisonRecord poisonRecord = poisonRecord(
                record == null ? null : record.topic(),
                record == null ? -1 : record.partition(),
                record == null ? -1L : record.offset(),
                event,
                exception
        );
        addPoison(resultBuilder, poisonRecord.detail());
        publishPoisonRecord(poisonRecord);
    }

    private void handlePoison(PersistCandidate candidate,
                              Exception exception,
                              KafkaMessagePersistBatchResult.Builder resultBuilder) {
        PoisonRecord poisonRecord = poisonRecord(
                candidate.topic(),
                candidate.partition(),
                candidate.offset(),
                candidate.event(),
                exception
        );
        addPoison(resultBuilder, poisonRecord.detail());
        publishPoisonRecord(poisonRecord);
    }

    private PoisonRecord poisonRecord(String topic,
                                      int partition,
                                      long offset,
                                      MessageEvent event,
                                      Exception exception) {
        Throwable rootCause = rootCause(exception);
        return new PoisonRecord(
                topic,
                partition,
                offset,
                event == null ? null : event.getMessageId(),
                resolveClientMessageId(event),
                safeConversationId(event),
                rootCause == null ? Exception.class.getName() : rootCause.getClass().getName(),
                summarize(exception)
        );
    }

    private void addPoison(KafkaMessagePersistBatchResult.Builder resultBuilder,
                           KafkaMessagePersistBatchResult.Detail detail) {
        resultBuilder.addPoison(detail);
        messageServiceMetrics.recordPoison();
    }

    private void addRetryable(KafkaMessagePersistBatchResult.Builder resultBuilder,
                              KafkaMessagePersistBatchResult.Detail detail) {
        resultBuilder.addRetryable(detail);
        messageServiceMetrics.recordRetryable();
    }

    private void publishPoisonRecord(PoisonRecord poisonRecord) {
        String dltTopic = resolveDltTopic(poisonRecord.originalTopic());
        try {
            poisonRecordDltKafkaTemplate.send(dltTopic, resolveDltKey(poisonRecord), poisonRecord.payload()).join();
            messageServiceMetrics.recordDlt();
            log.warn("Published poison message event to DLT. originalTopic={}, partition={}, offset={}, dltTopic={}, reason={}",
                    poisonRecord.originalTopic(),
                    poisonRecord.originalPartition(),
                    poisonRecord.originalOffset(),
                    dltTopic,
                    poisonRecord.exceptionSummary());
        } catch (Exception exception) {
            Throwable rootCause = rootCause(exception);
            throw new IllegalStateException("failed to publish poison record to DLT. originalTopic="
                    + poisonRecord.originalTopic()
                    + ", partition="
                    + poisonRecord.originalPartition()
                    + ", offset="
                    + poisonRecord.originalOffset()
                    + ", reason="
                    + summarize(rootCause == null ? exception : rootCause), rootCause == null ? exception : rootCause);
        }
    }

    private String resolveDltTopic(String originalTopic) {
        if (StringUtils.hasText(configuredChatDltTopic)) {
            return configuredChatDltTopic.trim();
        }
        if (StringUtils.hasText(originalTopic)) {
            return originalTopic.trim() + ".dlt";
        }
        return "im-chat-topic.dlt";
    }

    private String resolveDltKey(PoisonRecord poisonRecord) {
        if (poisonRecord.messageId() != null) {
            return poisonRecord.messageId().toString();
        }
        if (StringUtils.hasText(poisonRecord.clientMessageId())) {
            return poisonRecord.clientMessageId();
        }
        if (StringUtils.hasText(poisonRecord.conversationId())) {
            return poisonRecord.conversationId();
        }
        return poisonRecord.originalPartition() + ":" + poisonRecord.originalOffset();
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

    private String summarize(Throwable throwable) {
        if (throwable == null) {
            return "unknown";
        }
        Throwable root = rootCause(throwable);
        Throwable effective = root == null ? throwable : root;
        String message = effective.getMessage();
        if (!StringUtils.hasText(message)) {
            message = throwable.getMessage();
        }
        String normalizedMessage = StringUtils.hasText(message) ? message.trim() : effective.getClass().getSimpleName();
        if (normalizedMessage.length() > 200) {
            normalizedMessage = normalizedMessage.substring(0, 200);
        }
        return effective.getClass().getSimpleName() + ":" + normalizedMessage;
    }

    private Throwable rootCause(Throwable throwable) {
        if (throwable == null) {
            return null;
        }
        Throwable root = throwable;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        return root;
    }

    private void markPersistedCandidate(PersistCandidate candidate) {
        messageStateOrchestrator.advancePersisted(candidate.event());
    }

    private void logBatchResult(KafkaMessagePersistBatchResult result) {
        if (result.getMessageCount() == 0 && result.getPoisonCount() == 0) {
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

    private record PersistCandidate(String topic,
                                    int partition,
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

    static record PoisonMessageDltPayload(String originalTopic,
                                          int originalPartition,
                                          long originalOffset,
                                          Long messageId,
                                          String clientMessageId,
                                          String conversationId,
                                          String exceptionType,
                                          String exceptionSummary) {
    }

    private record PoisonRecord(String originalTopic,
                                int originalPartition,
                                long originalOffset,
                                Long messageId,
                                String clientMessageId,
                                String conversationId,
                                String exceptionType,
                                String exceptionSummary) {

        KafkaMessagePersistBatchResult.Detail detail() {
            return new KafkaMessagePersistBatchResult.Detail(
                    originalPartition,
                    originalOffset,
                    messageId,
                    clientMessageId,
                    conversationId,
                    exceptionSummary
            );
        }

        PoisonMessageDltPayload payload() {
            return new PoisonMessageDltPayload(
                    originalTopic,
                    originalPartition,
                    originalOffset,
                    messageId,
                    clientMessageId,
                    conversationId,
                    exceptionType,
                    exceptionSummary
            );
        }
    }
}
