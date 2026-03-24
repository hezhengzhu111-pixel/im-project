package com.im.listener;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.dto.WsPushEvent;
import com.im.service.IImService;
import com.im.service.ProcessedMessageDeduplicator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class WsPushKafkaListener {

    private static final String EVENT_TYPE_MESSAGE = "MESSAGE";
    private static final String EVENT_TYPE_READ_RECEIPT = "READ_RECEIPT";

    private final IImService imService;
    private final ProcessedMessageDeduplicator deduplicator;

    @KafkaListener(
            id = "ws-push-listener",
            topics = "${im.kafka.topic.push}",
            containerFactory = "kafkaListenerContainerFactory")
    public void onMessage(String raw, Acknowledgment ack) {
        try {
            consume(raw);
            if (ack != null) {
                ack.acknowledge();
            }
        } catch (Exception e) {
            log.error("Consume ws push event failed. payload={}", raw, e);
            throw e;
        }
    }

    private void consume(String raw) {
        if (!StringUtils.hasText(raw)) {
            return;
        }
        WsPushEvent event = JSON.parseObject(raw, WsPushEvent.class);
        if (event == null || CollectionUtils.isEmpty(event.getTargetUserIds())) {
            return;
        }
        String eventType = normalizeEventType(event.getEventType());
        String eventId = resolveEventId(event);

        MessageDTO messageDTO = null;
        ReadReceiptDTO readReceiptDTO = null;
        for (Long userId : event.getTargetUserIds()) {
            if (userId == null) {
                continue;
            }
            if (!deduplicator.tryMarkProcessed(eventId + ":" + userId)) {
                continue;
            }
            if (EVENT_TYPE_READ_RECEIPT.equals(eventType)) {
                if (readReceiptDTO == null) {
                    readReceiptDTO = JSON.parseObject(event.getPayload(), ReadReceiptDTO.class);
                }
                if (readReceiptDTO != null) {
                    imService.pushReadReceiptToUser(readReceiptDTO, userId);
                }
                continue;
            }
            if (messageDTO == null) {
                messageDTO = JSON.parseObject(event.getPayload(), MessageDTO.class);
            }
            if (messageDTO != null) {
                imService.pushMessageToUser(messageDTO, userId);
            }
        }
    }

    private String normalizeEventType(String eventType) {
        if (!StringUtils.hasText(eventType)) {
            return EVENT_TYPE_MESSAGE;
        }
        return eventType.trim().toUpperCase();
    }

    private String resolveEventId(WsPushEvent event) {
        if (StringUtils.hasText(event.getEventId())) {
            return event.getEventId();
        }
        Long messageId = event.getMessageId();
        String eventType = normalizeEventType(event.getEventType());
        return eventType + ":" + (messageId == null ? "unknown" : messageId);
    }
}
