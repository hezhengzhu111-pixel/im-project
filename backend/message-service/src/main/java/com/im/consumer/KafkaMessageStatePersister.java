package com.im.consumer;

import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
import com.im.service.orchestrator.MessageStateOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class KafkaMessageStatePersister {

    private final MessageStateOrchestrator messageStateOrchestrator;

    @KafkaListener(
            topics = "${im.kafka.read-topic:im-read-topic}",
            groupId = "im-read-persister",
            containerFactory = "readEventKafkaListenerContainerFactory"
    )
    public void persistReadEvent(ReadEvent event) {
        MessageStateOrchestrator.ReadStageResult result = messageStateOrchestrator.applyReadEvent(event);
        if (result.disposition() == MessageStateOrchestrator.ReadDisposition.IGNORED_INVALID) {
            return;
        }
        log.info("Persisted read event. userId={}, conversationId={}, lastReadMessageId={}",
                event.getUserId(), event.getConversationId(), event.getLastReadMessageId());
    }

    @KafkaListener(
            topics = "${im.kafka.status-topic:im-status-topic}",
            groupId = "im-status-persister",
            containerFactory = "statusChangeEventKafkaListenerContainerFactory"
    )
    public void persistStatusChangeEvent(StatusChangeEvent event) {
        MessageStateOrchestrator.StatusStageResult result = messageStateOrchestrator.applyStatusEvent(event);
        if (result.disposition() == MessageStateOrchestrator.StatusDisposition.IGNORED_INVALID) {
            return;
        }
        StatusChangeEvent appliedEvent = result.event();
        if (result.disposition() == MessageStateOrchestrator.StatusDisposition.BACKLOGGED) {
            log.warn("Stored pending status change event for message not yet persisted. messageId={}, status={}",
                    appliedEvent.getMessageId(), appliedEvent.getNewStatus());
            return;
        }
        if (result.disposition() == MessageStateOrchestrator.StatusDisposition.SKIPPED_ALREADY_APPLIED) {
            log.info("Skipped already-applied status change replay. messageId={}, status={}, messageUpdatedTime={}",
                    appliedEvent.getMessageId(),
                    appliedEvent.getNewStatus(),
                    appliedEvent.getChangedAt());
            return;
        }
        if (result.disposition() == MessageStateOrchestrator.StatusDisposition.APPLIED) {
            log.info("Persisted status change event. messageId={}, status={}",
                    appliedEvent.getMessageId(), appliedEvent.getNewStatus());
        }
    }
}
