package com.im.task;

import com.im.consumer.KafkaMessageStatePersister;
import com.im.dto.StatusChangeEvent;
import com.im.mapper.MessageMapper;
import com.im.message.entity.Message;
import com.im.service.support.PendingStatusEventService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class PendingStatusReplayTask {

    private final PendingStatusEventService pendingStatusEventService;
    private final MessageMapper messageMapper;
    private final KafkaMessageStatePersister kafkaMessageStatePersister;

    @Scheduled(fixedDelay = 30000, initialDelay = 30000)
    public void replayPendingStatusEvents() {
        List<Long> pendingMessageIds = pendingStatusEventService.listPendingMessageIds();
        if (pendingMessageIds == null || pendingMessageIds.isEmpty()) {
            return;
        }

        for (Long messageId : pendingMessageIds) {
            if (messageId == null) {
                continue;
            }
            replayMessageStatusEvents(messageId);
        }
    }

    private void replayMessageStatusEvents(Long messageId) {
        try {
            Message persistedMessage = messageMapper.selectById(messageId);
            if (persistedMessage == null) {
                return;
            }
            List<StatusChangeEvent> events = pendingStatusEventService.listByMessageId(messageId);
            for (StatusChangeEvent event : events) {
                if (event == null) {
                    continue;
                }
                kafkaMessageStatePersister.persistStatusChangeEvent(event);
            }
        } catch (Exception exception) {
            log.error("Failed to replay pending status events. messageId={}", messageId, exception);
        }
    }
}
