package com.im.listener;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.dto.WsPushEvent;
import com.im.service.IImService;
import com.im.service.ProcessedMessageDeduplicator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.Acknowledgment;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WsPushKafkaListenerTest {

    @Mock
    private IImService imService;

    @Mock
    private ProcessedMessageDeduplicator deduplicator;

    @InjectMocks
    private WsPushKafkaListener listener;

    @Test
    void onMessage_messageEvent_shouldPushToTargets() {
        MessageDTO messageDTO = new MessageDTO();
        messageDTO.setId(100L);
        messageDTO.setContent("hello");

        WsPushEvent event = WsPushEvent.builder()
                .eventId("evt-1")
                .eventType("MESSAGE")
                .messageId(100L)
                .targetUserIds(List.of(2L, 3L))
                .payload(JSON.toJSONString(messageDTO))
                .build();
        Acknowledgment acknowledgment = org.mockito.Mockito.mock(Acknowledgment.class);

        when(deduplicator.tryMarkProcessed("evt-1:2")).thenReturn(true);
        when(deduplicator.tryMarkProcessed("evt-1:3")).thenReturn(true);

        listener.onMessage(JSON.toJSONString(event), acknowledgment);

        verify(imService).pushMessageToUser(any(MessageDTO.class), eq(2L));
        verify(imService).pushMessageToUser(any(MessageDTO.class), eq(3L));
        verify(acknowledgment).acknowledge();
    }

    @Test
    void onMessage_duplicateEvent_shouldSkipPush() {
        MessageDTO messageDTO = new MessageDTO();
        messageDTO.setId(101L);

        WsPushEvent event = WsPushEvent.builder()
                .eventId("evt-dup")
                .eventType("MESSAGE")
                .messageId(101L)
                .targetUserIds(List.of(2L))
                .payload(JSON.toJSONString(messageDTO))
                .build();
        Acknowledgment acknowledgment = org.mockito.Mockito.mock(Acknowledgment.class);

        when(deduplicator.tryMarkProcessed("evt-dup:2")).thenReturn(false);

        listener.onMessage(JSON.toJSONString(event), acknowledgment);

        verify(imService, never()).pushMessageToUser(any(MessageDTO.class), eq(2L));
        verify(acknowledgment).acknowledge();
    }

    @Test
    void onMessage_readReceiptEvent_shouldPushToTargets() {
        ReadReceiptDTO receiptDTO = ReadReceiptDTO.builder()
                .toUserId(2L)
                .lastReadMessageId(200L)
                .build();

        WsPushEvent event = WsPushEvent.builder()
                .eventId("evt-rr")
                .eventType("READ_RECEIPT")
                .messageId(200L)
                .targetUserIds(List.of(2L))
                .payload(JSON.toJSONString(receiptDTO))
                .build();
        Acknowledgment acknowledgment = org.mockito.Mockito.mock(Acknowledgment.class);

        when(deduplicator.tryMarkProcessed("evt-rr:2")).thenReturn(true);

        listener.onMessage(JSON.toJSONString(event), acknowledgment);

        verify(imService).pushReadReceiptToUser(any(ReadReceiptDTO.class), eq(2L));
        verify(acknowledgment).acknowledge();
    }
}
