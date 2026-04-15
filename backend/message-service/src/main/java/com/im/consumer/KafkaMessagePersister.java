package com.im.consumer;

import com.im.dto.MessageEvent;
import com.im.enums.MessageEventType;
import com.im.message.entity.Message;
import com.im.service.MessagePersistenceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

@Slf4j
@Component
@RequiredArgsConstructor
public class KafkaMessagePersister {

    private final MessagePersistenceService messagePersistenceService;

    @KafkaListener(
            topics = "${im.kafka.chat-topic:im-chat-topic}",
            groupId = "im-db-persister",
            containerFactory = "messageEventBatchKafkaListenerContainerFactory"
    )
    public void persistMessages(List<ConsumerRecord<String, MessageEvent>> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        List<Message> messages = records.stream()
                .map(ConsumerRecord::value)
                .filter(Objects::nonNull)
                .filter(event -> event.getEventType() == MessageEventType.MESSAGE)
                .map(this::toMessage)
                .toList();
        if (messages.isEmpty()) {
            log.debug("No message events to persist. recordCount={}", records.size());
            return;
        }

        try {
            messagePersistenceService.saveBatch(messages);
            log.info("Persisted Kafka message batch. recordCount={}, messageCount={}",
                    records.size(), messages.size());
        } catch (DuplicateKeyException duplicate) {
            log.debug("Ignore duplicate Kafka message batch. recordCount={}, messageCount={}",
                    records.size(), messages.size());
        } catch (Exception exception) {
            log.error("Failed to persist Kafka message batch. recordCount={}, messageCount={}",
                    records.size(), messages.size(), exception);
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
}
