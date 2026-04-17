package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import com.im.dto.request.SendGroupMessageRequest;
import com.im.dto.request.SendPrivateMessageRequest;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.service.MessageService;
import com.im.service.command.SendMessageCommand;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageControllerTest {

    @Mock
    private MessageService messageService;

    @InjectMocks
    private MessageController messageController;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(messageController, "textEnforce", true);
        ReflectionTestUtils.setField(messageController, "textMaxLength", 2000);
    }

    @Test
    void sendPrivateMessageSuccess() {
        SendPrivateMessageRequest request = new SendPrivateMessageRequest();
        request.setReceiverId("2");
        request.setMessageType(MessageType.TEXT);
        request.setContent("hello");
        MessageDTO dto = new MessageDTO();
        dto.setId(100L);
        dto.setAckStage(MessageDTO.ACK_STAGE_ACCEPTED);
        when(messageService.sendMessage(any(SendMessageCommand.class))).thenReturn(dto);

        ApiResponse<MessageDTO> response = messageController.sendPrivateMessage(1L, request);

        assertEquals(200, response.getCode());
        assertEquals(100L, response.getData().getId());
        assertEquals(MessageDTO.ACK_STAGE_ACCEPTED, response.getData().getAckStage());
        ArgumentCaptor<SendMessageCommand> captor = ArgumentCaptor.forClass(SendMessageCommand.class);
        verify(messageService).sendMessage(captor.capture());
        assertEquals(1L, captor.getValue().getSenderId());
        assertEquals(2L, captor.getValue().getReceiverId());
        assertTrue(!captor.getValue().isGroup());
    }

    @Test
    void sendPrivateMessageBusinessException() {
        SendPrivateMessageRequest request = new SendPrivateMessageRequest();
        request.setReceiverId("2");
        request.setMessageType(MessageType.TEXT);
        when(messageService.sendMessage(any(SendMessageCommand.class))).thenThrow(new BusinessException("Rate limit"));

        BusinessException exception = assertThrows(BusinessException.class,
                () -> messageController.sendPrivateMessage(1L, request));

        assertEquals("Rate limit", exception.getMessage());
    }

    @Test
    void sendPrivateMessageShouldRejectSystemType() {
        SendPrivateMessageRequest request = new SendPrivateMessageRequest();
        request.setReceiverId("2");
        request.setMessageType(MessageType.SYSTEM);

        assertThrows(BusinessException.class, () -> messageController.sendPrivateMessage(1L, request));
    }

    @Test
    void sendGroupMessageSuccess() {
        SendGroupMessageRequest request = new SendGroupMessageRequest();
        request.setGroupId("8");
        request.setMessageType(MessageType.TEXT);
        request.setContent("group-hi");
        MessageDTO dto = new MessageDTO();
        dto.setId(200L);
        dto.setAckStage(MessageDTO.ACK_STAGE_PERSISTED);
        when(messageService.sendMessage(any(SendMessageCommand.class))).thenReturn(dto);

        ApiResponse<MessageDTO> response = messageController.sendGroupMessage(1L, request);

        assertEquals(200, response.getCode());
        assertEquals(200L, response.getData().getId());
        assertEquals(MessageDTO.ACK_STAGE_PERSISTED, response.getData().getAckStage());
        ArgumentCaptor<SendMessageCommand> captor = ArgumentCaptor.forClass(SendMessageCommand.class);
        verify(messageService).sendMessage(captor.capture());
        assertEquals(1L, captor.getValue().getSenderId());
        assertEquals(8L, captor.getValue().getGroupId());
        assertTrue(captor.getValue().isGroup());
    }
}
