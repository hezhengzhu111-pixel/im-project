package com.im.service;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.dto.WsPushEvent;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WsPushEventDispatcherTest {

    @Mock
    private IImService imService;

    @Mock
    private ProcessedMessageDeduplicator deduplicator;

    @Mock
    private MessageRetryQueue retryQueue;

    @InjectMocks
    private WsPushEventDispatcher dispatcher;

    @Test
    void dispatchEvent_messageEvent_shouldPushToTargets() {
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

        when(deduplicator.isProcessed("evt-1:2")).thenReturn(false);
        when(deduplicator.isProcessed("evt-1:3")).thenReturn(false);
        when(imService.pushMessageToUser(any(MessageDTO.class), eq(2L))).thenReturn(true);
        when(imService.pushMessageToUser(any(MessageDTO.class), eq(3L))).thenReturn(true);

        dispatcher.dispatchEvent(event);

        verify(imService).pushMessageToUser(any(MessageDTO.class), eq(2L));
        verify(imService).pushMessageToUser(any(MessageDTO.class), eq(3L));
        verify(deduplicator).markProcessed("evt-1:2");
        verify(deduplicator).markProcessed("evt-1:3");
    }

    @Test
    void dispatchEvent_duplicateEvent_shouldSkipPush() {
        MessageDTO messageDTO = new MessageDTO();
        messageDTO.setId(101L);

        WsPushEvent event = WsPushEvent.builder()
                .eventId("evt-dup")
                .eventType("MESSAGE")
                .messageId(101L)
                .targetUserIds(List.of(2L))
                .payload(JSON.toJSONString(messageDTO))
                .build();

        when(deduplicator.isProcessed("evt-dup:2")).thenReturn(true);

        dispatcher.dispatchEvent(event);

        verify(imService, never()).pushMessageToUser(any(MessageDTO.class), eq(2L));
        verify(retryQueue, never()).enqueue(any(), any(), any());
    }

    @Test
    void dispatchEvent_readReceiptEvent_shouldPushToTargets() {
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

        when(deduplicator.isProcessed("evt-rr:2")).thenReturn(false);
        when(imService.pushReadReceiptToUser(any(ReadReceiptDTO.class), eq(2L))).thenReturn(true);

        dispatcher.dispatchEvent(event);

        verify(imService).pushReadReceiptToUser(any(ReadReceiptDTO.class), eq(2L));
        verify(deduplicator).markProcessed("evt-rr:2");
    }
}
