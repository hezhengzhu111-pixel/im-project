package com.im.listener;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.service.ProcessedMessageDeduplicator;
import com.im.service.impl.ImServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.connection.Message;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RedisMessageListenerTest {

    @Mock
    private ImServiceImpl imService;

    @Mock
    private ProcessedMessageDeduplicator deduplicator;

    @InjectMocks
    private RedisMessageListener listener;

    @Test
    void onMessage_PrivateMessage_ShouldDeduplicateAndSend() {
        MessageDTO messageDTO = new MessageDTO();
        messageDTO.setId(100L);
        messageDTO.setStatus("SENT");
        messageDTO.setGroup(false);

        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("type", "MESSAGE");
        payloadMap.put("data", messageDTO);

        Message mockMessage = mock(Message.class);
        when(mockMessage.getBody()).thenReturn(JSON.toJSONString(payloadMap).getBytes(StandardCharsets.UTF_8));
        
        when(deduplicator.tryMarkProcessed("100:SENT")).thenReturn(true);

        listener.onMessage(mockMessage, null);

        verify(imService).sendPrivateMessage(any(MessageDTO.class));
        verify(imService, never()).sendGroupMessage(any(MessageDTO.class));
    }

    @Test
    void onMessage_GroupMessage_ShouldDeduplicateAndSend() {
        MessageDTO messageDTO = new MessageDTO();
        messageDTO.setId(101L);
        messageDTO.setStatus("SENT");
        messageDTO.setGroup(true);

        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("type", "MESSAGE");
        payloadMap.put("data", messageDTO);

        Message mockMessage = mock(Message.class);
        when(mockMessage.getBody()).thenReturn(JSON.toJSONString(payloadMap).getBytes(StandardCharsets.UTF_8));
        
        when(deduplicator.tryMarkProcessed("101:SENT")).thenReturn(true);

        listener.onMessage(mockMessage, null);

        verify(imService).sendGroupMessage(any(MessageDTO.class));
        verify(imService, never()).sendPrivateMessage(any(MessageDTO.class));
    }

    @Test
    void onMessage_DuplicateMessage_ShouldIgnore() {
        MessageDTO messageDTO = new MessageDTO();
        messageDTO.setId(102L);
        messageDTO.setStatus("SENT");

        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("type", "MESSAGE");
        payloadMap.put("data", messageDTO);

        Message mockMessage = mock(Message.class);
        when(mockMessage.getBody()).thenReturn(JSON.toJSONString(payloadMap).getBytes(StandardCharsets.UTF_8));
        
        when(deduplicator.tryMarkProcessed("102:SENT")).thenReturn(false); // Duplicate

        listener.onMessage(mockMessage, null);

        verify(imService, never()).sendGroupMessage(any());
        verify(imService, never()).sendPrivateMessage(any());
    }

    @Test
    void onMessage_ReadReceipt_ShouldPush() {
        ReadReceiptDTO receipt = new ReadReceiptDTO();
        receipt.setLastReadMessageId(200L);

        Map<String, Object> payloadMap = new HashMap<>();
        payloadMap.put("type", "READ_RECEIPT");
        payloadMap.put("data", receipt);

        Message mockMessage = mock(Message.class);
        when(mockMessage.getBody()).thenReturn(JSON.toJSONString(payloadMap).getBytes(StandardCharsets.UTF_8));

        listener.onMessage(mockMessage, null);

        verify(imService).pushReadReceipt(any(ReadReceiptDTO.class));
    }

    @Test
    void onMessage_InvalidJson_ShouldCatchExceptionAndNotThrow() {
        Message mockMessage = mock(Message.class);
        when(mockMessage.getBody()).thenReturn("{invalid_json".getBytes(StandardCharsets.UTF_8));

        listener.onMessage(mockMessage, null);

        verify(imService, never()).sendGroupMessage(any());
        verify(imService, never()).sendPrivateMessage(any());
    }
}
