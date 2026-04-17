package com.im.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.MessageDTO;
import com.im.exception.GlobalExceptionHandler;
import com.im.filter.InternalRequestBodyCachingFilter;
import com.im.interceptor.JwtAuthInterceptor;
import com.im.service.MessageService;
import com.im.service.command.SendMessageCommand;
import com.im.util.AuthHeaderUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class MessageInternalControllerSecurityTest {

    @Mock
    private MessageService messageService;

    @Mock
    private ObjectProvider<StringRedisTemplate> redisTemplateProvider;

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        JwtAuthInterceptor interceptor = new JwtAuthInterceptor(new ObjectMapper(), redisTemplateProvider);
        ReflectionTestUtils.setField(interceptor, "securityMode", "gateway");
        ReflectionTestUtils.setField(interceptor, "internalSecret", "im-internal-secret");
        ReflectionTestUtils.setField(interceptor, "internalMaxSkewMs", 300000L);
        ReflectionTestUtils.setField(interceptor, "internalReplayTtlSeconds", 300L);
        ReflectionTestUtils.setField(interceptor, "internalReplayKeyPrefix", "im:internal:replay:");
        ReflectionTestUtils.setField(interceptor, "internalLegacySecretOnlyEnabled", false);
        ReflectionTestUtils.setField(interceptor, "internalHeaderName", "X-Internal-Secret");
        ReflectionTestUtils.setField(interceptor, "gatewayUserIdHeader", "X-User-Id");
        ReflectionTestUtils.setField(interceptor, "gatewayUsernameHeader", "X-Username");
        ReflectionTestUtils.setField(interceptor, "gatewayAuthSecret", "im-gateway-auth-secret");
        ReflectionTestUtils.setField(interceptor, "maxSkewMs", 300000L);
        ReflectionTestUtils.setField(interceptor, "replayProtectionEnabled", true);
        ReflectionTestUtils.setField(interceptor, "replayProtectionTtlSeconds", 300L);
        ReflectionTestUtils.setField(interceptor, "replayProtectionKeyPrefix", "im:auth:replay:");

        lenient().when(redisTemplateProvider.getIfAvailable()).thenReturn(redisTemplate);
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);

        MessageInternalController controller = new MessageInternalController(messageService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .addFilters(new InternalRequestBodyCachingFilter())
                .addInterceptors(interceptor)
                .build();
    }

    @Test
    void sendSystemPrivateMessage_shouldAllowValidSignedRequest() throws Exception {
        String body = "{\"senderId\":1,\"receiverId\":2,\"content\":\"system-hi\"}";
        String timestamp = String.valueOf(System.currentTimeMillis());
        String nonce = "msg-nonce-1";
        MessageDTO message = new MessageDTO();
        message.setId(300L);

        when(valueOperations.setIfAbsent(eq("im:internal:replay:" + nonce), eq("1"), any(java.time.Duration.class))).thenReturn(Boolean.TRUE);
        when(messageService.sendMessage(any(SendMessageCommand.class))).thenReturn(message);

        mockMvc.perform(post("/internal/message/system/private")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header(AuthHeaderUtil.INTERNAL_TIMESTAMP_HEADER, timestamp)
                        .header(AuthHeaderUtil.INTERNAL_NONCE_HEADER, nonce)
                        .header(AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER,
                                signature("POST", "/internal/message/system/private", body, timestamp, nonce)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(300));

        verify(messageService).sendMessage(any(SendMessageCommand.class));
    }

    @Test
    void sendSystemPrivateMessage_shouldRejectReplayedNonce() throws Exception {
        String body = "{\"senderId\":1,\"receiverId\":2,\"content\":\"system-hi\"}";
        String timestamp = String.valueOf(System.currentTimeMillis());
        String nonce = "msg-nonce-2";
        MessageDTO message = new MessageDTO();
        message.setId(301L);

        when(valueOperations.setIfAbsent(eq("im:internal:replay:" + nonce), eq("1"), any(java.time.Duration.class)))
                .thenReturn(Boolean.TRUE, Boolean.FALSE);
        when(messageService.sendMessage(any(SendMessageCommand.class))).thenReturn(message);

        mockMvc.perform(post("/internal/message/system/private")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header(AuthHeaderUtil.INTERNAL_TIMESTAMP_HEADER, timestamp)
                        .header(AuthHeaderUtil.INTERNAL_NONCE_HEADER, nonce)
                        .header(AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER,
                                signature("POST", "/internal/message/system/private", body, timestamp, nonce)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));

        mockMvc.perform(post("/internal/message/system/private")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header(AuthHeaderUtil.INTERNAL_TIMESTAMP_HEADER, timestamp)
                        .header(AuthHeaderUtil.INTERNAL_NONCE_HEADER, nonce)
                        .header(AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER,
                                signature("POST", "/internal/message/system/private", body, timestamp, nonce)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401));

        verify(messageService, times(1)).sendMessage(any(SendMessageCommand.class));
    }

    private String signature(String method, String path, String body, String timestamp, String nonce) {
        return AuthHeaderUtil.signHmacSha256(
                "im-internal-secret",
                AuthHeaderUtil.buildInternalSignedFields(
                        method,
                        path,
                        AuthHeaderUtil.sha256Base64Url(body.getBytes(StandardCharsets.UTF_8)),
                        timestamp,
                        nonce
                )
        );
    }
}
