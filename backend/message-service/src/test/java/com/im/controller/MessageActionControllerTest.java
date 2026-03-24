package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.MessageDTO;
import com.im.service.MessageService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageActionControllerTest {

    @Mock
    private MessageService messageService;

    @InjectMocks
    private MessageActionController controller;

    @Test
    void recall_Success() {
        MessageDTO dto = new MessageDTO();
        dto.setId(100L);
        when(messageService.recallMessage(1L, 100L)).thenReturn(dto);

        ApiResponse<MessageDTO> response = controller.recall(1L, 100L);

        assertEquals(200, response.getCode());
        assertEquals(100L, response.getData().getId());
    }

    @Test
    void delete_Success() {
        MessageDTO dto = new MessageDTO();
        dto.setId(100L);
        when(messageService.deleteMessage(1L, 100L)).thenReturn(dto);

        ApiResponse<MessageDTO> response = controller.delete(1L, 100L);

        assertEquals(200, response.getCode());
        assertEquals(100L, response.getData().getId());
    }
}
