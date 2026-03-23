package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.entity.MessageOutboxEvent;
import com.im.mapper.MessageOutboxMapper;
import com.im.service.OutboxService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageRetryControllerTest {

    @Mock
    private MessageOutboxMapper outboxMapper;

    @Mock
    private OutboxService outboxService;

    @InjectMocks
    private MessageRetryController controller;

    @Test
    void retryPrivate_InvalidMessageId_ShouldReturnBadRequest() {
        ApiResponse<Void> response = controller.retryPrivate(-1L);
        assertEquals(400, response.getCode());
    }

    @Test
    void retryPrivate_NotFound_ShouldReturnNotFound() {
        when(outboxMapper.selectLatestByRelatedMessageIdAndTopic(eq(100L), anyString())).thenReturn(null);
        
        ApiResponse<Void> response = controller.retryPrivate(100L);
        
        assertEquals(404, response.getCode());
    }

    @Test
    void retryPrivate_Success() {
        MessageOutboxEvent event = new MessageOutboxEvent();
        event.setTopic("topic");
        event.setMessageKey("key");
        event.setPayload("payload");
        when(outboxMapper.selectLatestByRelatedMessageIdAndTopic(eq(100L), anyString())).thenReturn(event);
        
        ApiResponse<Void> response = controller.retryPrivate(100L);
        
        assertEquals(200, response.getCode());
        verify(outboxService).enqueueAfterCommit("topic", "key", "payload", 100L);
    }
}
