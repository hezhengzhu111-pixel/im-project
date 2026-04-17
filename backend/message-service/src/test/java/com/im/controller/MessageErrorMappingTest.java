package com.im.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.MessageDTO;
import com.im.enums.CommonErrorCode;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.exception.GlobalExceptionHandler;
import com.im.service.MessageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class MessageErrorMappingTest {

    @Mock
    private MessageService messageService;

    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        MessageController messageController = new MessageController();
        ReflectionTestUtils.setField(messageController, "messageService", messageService);
        ReflectionTestUtils.setField(messageController, "textEnforce", true);
        ReflectionTestUtils.setField(messageController, "textMaxLength", 2000);

        MessageActionController actionController = new MessageActionController();
        ReflectionTestUtils.setField(actionController, "messageService", messageService);

        mockMvc = MockMvcBuilders.standaloneSetup(messageController, actionController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void duplicateClientMessageId_shouldKeepStableSuccessfulResponse() throws Exception {
        MessageDTO dto = new MessageDTO();
        dto.setId(1001L);
        dto.setAckStage(MessageDTO.ACK_STAGE_ACCEPTED);
        when(messageService.sendMessage(any())).thenReturn(dto);

        String body = objectMapper.writeValueAsString(java.util.Map.of(
                "receiverId", "2",
                "messageType", MessageType.TEXT,
                "clientMessageId", "dup-1",
                "content", "hello"
        ));

        MvcResult first = mockMvc.perform(post("/s/send/private")
                        .requestAttr("userId", 1L)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andReturn();
        assertMessage(first, 1001L, MessageDTO.ACK_STAGE_ACCEPTED);

        MvcResult second = mockMvc.perform(post("/s/send/private")
                        .requestAttr("userId", 1L)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andReturn();
        assertMessage(second, 1001L, MessageDTO.ACK_STAGE_ACCEPTED);
    }

    @Test
    void invalidCursor_shouldReturnUnifiedCode() throws Exception {
        when(messageService.getPrivateMessagesCursor(eq(1L), eq(2L), any(), any(), any(), eq(20)))
                .thenThrow(new BusinessException(CommonErrorCode.INVALID_CURSOR));

        MvcResult mvcResult = mockMvc.perform(get("/s/private/2/cursor")
                        .requestAttr("userId", 1L)
                        .param("last_message_id", "10")
                        .param("after_message_id", "11"))
                .andExpect(status().isBadRequest())
                .andReturn();
        assertError(mvcResult, CommonErrorCode.INVALID_CURSOR);
    }

    @Test
    void conversationAccessDenied_shouldReturnUnifiedCode() throws Exception {
        when(messageService.recallMessage(1L, 99L))
                .thenThrow(new BusinessException(CommonErrorCode.CONVERSATION_ACCESS_DENIED));

        MvcResult mvcResult = mockMvc.perform(post("/s/recall/99")
                        .requestAttr("userId", 1L))
                .andExpect(status().isForbidden())
                .andReturn();
        assertError(mvcResult, CommonErrorCode.CONVERSATION_ACCESS_DENIED);
    }

    private void assertMessage(MvcResult mvcResult, Long messageId, String ackStage) throws Exception {
        Map<?, ?> body = objectMapper.readValue(mvcResult.getResponse().getContentAsByteArray(), Map.class);
        Map<?, ?> data = (Map<?, ?>) body.get("data");
        org.junit.jupiter.api.Assertions.assertEquals(String.valueOf(messageId), String.valueOf(data.get("id")));
        org.junit.jupiter.api.Assertions.assertEquals(ackStage, data.get("ackStage"));
    }

    private void assertError(MvcResult mvcResult, CommonErrorCode errorCode) throws Exception {
        Map<?, ?> body = objectMapper.readValue(mvcResult.getResponse().getContentAsByteArray(), Map.class);
        org.junit.jupiter.api.Assertions.assertEquals(errorCode.getCode(), body.get("code"));
        org.junit.jupiter.api.Assertions.assertEquals(errorCode.getMessage(), body.get("message"));
    }
}
