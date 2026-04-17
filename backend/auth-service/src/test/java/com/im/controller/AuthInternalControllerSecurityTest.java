package com.im.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.WsTicketConsumeResultDTO;
import com.im.enums.CommonErrorCode;
import com.im.exception.AuthExceptionHandler;
import com.im.filter.InternalRequestBodyCachingFilter;
import com.im.interceptor.JwtAuthInterceptor;
import com.im.service.AuthPermissionService;
import com.im.service.AuthTokenRevokeService;
import com.im.service.AuthTokenService;
import com.im.service.AuthUserResourceService;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AuthInternalControllerSecurityTest {
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private AuthTokenService authTokenService;

    @Mock
    private AuthUserResourceService authUserResourceService;

    @Mock
    private AuthPermissionService authPermissionService;

    @Mock
    private AuthTokenRevokeService authTokenRevokeService;

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
        lenient().when(valueOperations.setIfAbsent(anyString(), eq("1"), any(java.time.Duration.class))).thenReturn(Boolean.TRUE);

        AuthInternalController controller = new AuthInternalController(
                authTokenService,
                authUserResourceService,
                authPermissionService,
                authTokenRevokeService
        );
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new AuthExceptionHandler())
                .addFilters(new InternalRequestBodyCachingFilter())
                .addInterceptors(interceptor)
                .build();
    }

    @Test
    void consumeWsTicket_shouldAllowValidSignedRequest() throws Exception {
        String body = "{\"ticket\":\"ticket-1\",\"userId\":1}";
        String timestamp = String.valueOf(System.currentTimeMillis());
        String nonce = "auth-nonce-1";

        when(authTokenService.consumeWsTicket("ticket-1", 1L)).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(true)
                .status(WsTicketConsumeResultDTO.STATUS_VALID)
                .userId(1L)
                .username("alice")
                .build());

        MvcResult mvcResult = mockMvc.perform(post("/api/auth/internal/ws-ticket/consume")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header(AuthHeaderUtil.INTERNAL_TIMESTAMP_HEADER, timestamp)
                        .header(AuthHeaderUtil.INTERNAL_NONCE_HEADER, nonce)
                        .header(AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER,
                                signature("POST", "/api/auth/internal/ws-ticket/consume", body, timestamp, nonce)))
                .andExpect(status().isOk())
                .andReturn();

        Map<?, ?> responseBody = objectMapper.readValue(mvcResult.getResponse().getContentAsString(), Map.class);
        Map<?, ?> data = (Map<?, ?>) responseBody.get("data");
        assertEquals(200, responseBody.get("code"));
        assertTrue(Boolean.TRUE.equals(data.get("valid")));
        assertEquals(1, ((Number) data.get("userId")).intValue());
        assertEquals("alice", data.get("username"));

        verify(authTokenService).consumeWsTicket("ticket-1", 1L);
    }

    @Test
    void consumeWsTicket_shouldRejectTamperedBody() throws Exception {
        String signedBody = "{\"ticket\":\"ticket-1\",\"userId\":1}";
        String actualBody = "{\"ticket\":\"ticket-2\",\"userId\":1}";
        String timestamp = String.valueOf(System.currentTimeMillis());
        String nonce = "auth-nonce-2";

        MvcResult mvcResult = mockMvc.perform(post("/api/auth/internal/ws-ticket/consume")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(actualBody)
                        .header(AuthHeaderUtil.INTERNAL_TIMESTAMP_HEADER, timestamp)
                        .header(AuthHeaderUtil.INTERNAL_NONCE_HEADER, nonce)
                        .header(AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER,
                                signature("POST", "/api/auth/internal/ws-ticket/consume", signedBody, timestamp, nonce)))
                .andExpect(status().isUnauthorized())
                .andReturn();

        Map<?, ?> responseBody = objectMapper.readValue(mvcResult.getResponse().getContentAsString(), Map.class);
        assertEquals(CommonErrorCode.INTERNAL_AUTH_REJECTED.getCode(), responseBody.get("code"));
        assertEquals(CommonErrorCode.INTERNAL_AUTH_REJECTED.getMessage(), responseBody.get("message"));

        verify(authTokenService, never()).consumeWsTicket(anyString(), any());
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
