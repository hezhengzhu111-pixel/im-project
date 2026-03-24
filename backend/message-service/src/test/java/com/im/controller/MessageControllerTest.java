package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import com.im.dto.request.SendGroupMessageRequest;
import com.im.dto.request.SendPrivateMessageRequest;
import com.im.exception.BusinessException;
import com.im.handler.GroupMessageHandler;
import com.im.handler.PrivateMessageHandler;
import com.im.service.MessageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageControllerTest {

    @Mock
    private MessageService messageService;

    @Mock
    private PrivateMessageHandler privateMessageHandler;

    @Mock
    private GroupMessageHandler groupMessageHandler;

    @InjectMocks
    private MessageController messageController;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(messageController, "textEnforce", true);
        ReflectionTestUtils.setField(messageController, "textMaxLength", 2000);
    }

    @Test
    void sendPrivateMessage_Success() {
        SendPrivateMessageRequest request = new SendPrivateMessageRequest();
        MessageDTO dto = new MessageDTO();
        dto.setId(100L);
        when(privateMessageHandler.handle(eq(1L), any())).thenReturn(dto);

        ApiResponse<MessageDTO> response = messageController.sendPrivateMessage(1L, request);

        assertEquals(200, response.getCode());
        assertEquals(100L, response.getData().getId());
    }

    @Test
    void sendPrivateMessage_BusinessException() {
        SendPrivateMessageRequest request = new SendPrivateMessageRequest();
        when(privateMessageHandler.handle(eq(1L), any())).thenThrow(new BusinessException("Rate limit"));

        ApiResponse<MessageDTO> response = messageController.sendPrivateMessage(1L, request);

        assertEquals(400, response.getCode());
        assertEquals("Rate limit", response.getMessage());
    }

    @Test
    void sendGroupMessage_Success() {
        SendGroupMessageRequest request = new SendGroupMessageRequest();
        MessageDTO dto = new MessageDTO();
        dto.setId(200L);
        when(groupMessageHandler.handle(eq(1L), any())).thenReturn(dto);

        ApiResponse<MessageDTO> response = messageController.sendGroupMessage(1L, request);

        assertEquals(200, response.getCode());
        assertEquals(200L, response.getData().getId());
    }
}
