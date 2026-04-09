package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import com.im.dto.request.SendSystemMessageRequest;
import com.im.enums.MessageType;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageInternalControllerTest {

    @Mock
    private MessageService messageService;

    @InjectMocks
    private MessageInternalController controller;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(controller, "internalSecret", "secret");
    }

    @Test
    void sendSystemPrivateMessageShouldDelegateToUnifiedService() {
        SendSystemMessageRequest request = new SendSystemMessageRequest();
        request.setReceiverId(2L);
        request.setSenderId(1L);
        request.setContent("system-hi");
        MessageDTO dto = new MessageDTO();
        dto.setId(300L);
        when(messageService.sendMessage(any(SendMessageCommand.class))).thenReturn(dto);

        ApiResponse<MessageDTO> response = controller.sendSystemPrivateMessage("secret", request);

        assertEquals(200, response.getCode());
        assertEquals(300L, response.getData().getId());
        ArgumentCaptor<SendMessageCommand> captor = ArgumentCaptor.forClass(SendMessageCommand.class);
        verify(messageService).sendMessage(captor.capture());
        assertEquals(2L, captor.getValue().getReceiverId());
        assertEquals(1L, captor.getValue().getSenderId());
        assertEquals(MessageType.SYSTEM, captor.getValue().getMessageType());
    }

    @Test
    void sendSystemPrivateMessageShouldRejectInvalidSecret() {
        SendSystemMessageRequest request = new SendSystemMessageRequest();
        request.setReceiverId(2L);
        request.setContent("system-hi");

        assertThrows(SecurityException.class, () -> controller.sendSystemPrivateMessage("bad", request));
    }
}
