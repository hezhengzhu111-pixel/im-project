package com.im.interceptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.filter.InternalRequestBodyCachingFilter;
import com.im.util.AuthHeaderUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static jakarta.servlet.http.HttpServletResponse.SC_UNAUTHORIZED;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class JwtAuthInterceptorTest {
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private ObjectProvider<StringRedisTemplate> redisTemplateProvider;

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @Mock
    private HttpServletRequest request;

    @Mock
    private HttpServletResponse response;

    private JwtAuthInterceptor interceptor;

    @BeforeEach
    void setUp() {
        interceptor = new JwtAuthInterceptor(objectMapper, redisTemplateProvider);
        ReflectionTestUtils.setField(interceptor, "securityMode", "gateway");
        ReflectionTestUtils.setField(interceptor, "gatewayOnlyEnabled", false);
        ReflectionTestUtils.setField(interceptor, "internalHeaderName", "X-Internal-Secret");
        ReflectionTestUtils.setField(interceptor, "internalSecret", "im-internal-secret");
        ReflectionTestUtils.setField(interceptor, "internalMaxSkewMs", 300000L);
        ReflectionTestUtils.setField(interceptor, "internalReplayTtlSeconds", 300L);
        ReflectionTestUtils.setField(interceptor, "internalReplayKeyPrefix", "im:internal:replay:");
        ReflectionTestUtils.setField(interceptor, "internalLegacySecretOnlyEnabled", false);
        ReflectionTestUtils.setField(interceptor, "gatewayUserIdHeader", "X-User-Id");
        ReflectionTestUtils.setField(interceptor, "gatewayUsernameHeader", "X-Username");
        ReflectionTestUtils.setField(interceptor, "maxSkewMs", 300000L);
        ReflectionTestUtils.setField(interceptor, "replayProtectionEnabled", true);
        ReflectionTestUtils.setField(interceptor, "replayProtectionTtlSeconds", 300L);
        ReflectionTestUtils.setField(interceptor, "replayProtectionKeyPrefix", "im:auth:replay:");
        ReflectionTestUtils.setField(interceptor, "gatewayAuthSecret", "im-gateway-auth-secret");
        lenient().when(redisTemplateProvider.getIfAvailable()).thenReturn(redisTemplate);
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        lenient().when(valueOperations.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(Boolean.TRUE);
    }

    @Test
    void preHandle_shouldAllowServiceWhitelist() throws Exception {
        when(request.getMethod()).thenReturn("GET");
        when(request.getRequestURI()).thenReturn("/actuator/health");

        boolean ok = interceptor.preHandle(request, response, new Object());

        assertTrue(ok);
    }

    @Test
    void preHandle_shouldAllowInternalSignaturePath() throws Exception {
        byte[] body = "{\"ticket\":\"abc\"}".getBytes(StandardCharsets.UTF_8);
        String path = "/api/auth/internal/ws-ticket/consume";
        String ts = String.valueOf(System.currentTimeMillis());
        String nonce = "nonce-1";

        when(request.getMethod()).thenReturn("POST");
        when(request.getRequestURI()).thenReturn(path);
        when(request.getAttribute(InternalRequestBodyCachingFilter.CACHED_BODY_ATTRIBUTE)).thenReturn(body);
        when(request.getHeader(AuthHeaderUtil.INTERNAL_TIMESTAMP_HEADER)).thenReturn(ts);
        when(request.getHeader(AuthHeaderUtil.INTERNAL_NONCE_HEADER)).thenReturn(nonce);
        when(request.getHeader(AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER))
                .thenReturn(internalSignature("POST", path, body, ts, nonce));

        boolean ok = interceptor.preHandle(request, response, new Object());

        assertTrue(ok);
        verify(valueOperations).setIfAbsent(eq("im:internal:replay:" + nonce), eq("1"), any(Duration.class));
    }

    @Test
    void preHandle_shouldRejectInternalPathWithoutSignatureHeaders() throws Exception {
        when(request.getMethod()).thenReturn("GET");
        when(request.getRequestURI()).thenReturn("/api/user/internal/exists/1");

        boolean ok = interceptor.preHandle(request, response, new Object());

        assertFalse(ok);
        verify(response).setStatus(SC_UNAUTHORIZED);
    }

    @Test
    void preHandle_shouldRejectTamperedInternalBody() throws Exception {
        byte[] signedBody = "{\"ticket\":\"abc\"}".getBytes(StandardCharsets.UTF_8);
        byte[] actualBody = "{\"ticket\":\"tampered\"}".getBytes(StandardCharsets.UTF_8);
        String path = "/api/auth/internal/ws-ticket/consume";
        String ts = String.valueOf(System.currentTimeMillis());
        String nonce = "nonce-2";

        when(request.getMethod()).thenReturn("POST");
        when(request.getRequestURI()).thenReturn(path);
        when(request.getAttribute(InternalRequestBodyCachingFilter.CACHED_BODY_ATTRIBUTE)).thenReturn(actualBody);
        when(request.getHeader(AuthHeaderUtil.INTERNAL_TIMESTAMP_HEADER)).thenReturn(ts);
        when(request.getHeader(AuthHeaderUtil.INTERNAL_NONCE_HEADER)).thenReturn(nonce);
        when(request.getHeader(AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER))
                .thenReturn(internalSignature("POST", path, signedBody, ts, nonce));

        boolean ok = interceptor.preHandle(request, response, new Object());

        assertFalse(ok);
        verify(response).setStatus(SC_UNAUTHORIZED);
        verify(valueOperations, never()).setIfAbsent(eq("im:internal:replay:" + nonce), eq("1"), any(Duration.class));
    }

    @Test
    void preHandle_shouldRejectExpiredInternalTimestamp() throws Exception {
        byte[] body = "{\"ticket\":\"abc\"}".getBytes(StandardCharsets.UTF_8);
        String path = "/api/auth/internal/ws-ticket/consume";
        String ts = String.valueOf(System.currentTimeMillis() - 600000L);
        String nonce = "nonce-expired";

        when(request.getMethod()).thenReturn("POST");
        when(request.getRequestURI()).thenReturn(path);
        when(request.getHeader(AuthHeaderUtil.INTERNAL_TIMESTAMP_HEADER)).thenReturn(ts);
        when(request.getHeader(AuthHeaderUtil.INTERNAL_NONCE_HEADER)).thenReturn(nonce);
        when(request.getHeader(AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER))
                .thenReturn(internalSignature("POST", path, body, ts, nonce));

        boolean ok = interceptor.preHandle(request, response, new Object());

        assertFalse(ok);
        verify(response).setStatus(SC_UNAUTHORIZED);
    }

    @Test
    void preHandle_shouldRejectReplayedInternalNonce() throws Exception {
        byte[] body = "{\"ticket\":\"abc\"}".getBytes(StandardCharsets.UTF_8);
        String path = "/internal/message/system/private";
        String ts = String.valueOf(System.currentTimeMillis());
        String nonce = "nonce-replay";
        String signature = internalSignature("POST", path, body, ts, nonce);

        when(request.getMethod()).thenReturn("POST");
        when(request.getRequestURI()).thenReturn(path);
        when(request.getAttribute(InternalRequestBodyCachingFilter.CACHED_BODY_ATTRIBUTE)).thenReturn(body);
        when(request.getHeader(AuthHeaderUtil.INTERNAL_TIMESTAMP_HEADER)).thenReturn(ts);
        when(request.getHeader(AuthHeaderUtil.INTERNAL_NONCE_HEADER)).thenReturn(nonce);
        when(request.getHeader(AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER)).thenReturn(signature);
        when(valueOperations.setIfAbsent(eq("im:internal:replay:" + nonce), eq("1"), any(Duration.class)))
                .thenReturn(Boolean.TRUE, Boolean.FALSE);

        boolean first = interceptor.preHandle(request, response, new Object());
        boolean second = interceptor.preHandle(request, response, new Object());

        assertTrue(first);
        assertFalse(second);
        verify(response).setStatus(SC_UNAUTHORIZED);
    }

    @Test
    void preHandle_shouldAllowGatewaySignedBusinessRequest() throws Exception {
        String userJson = objectMapper.writeValueAsString(Map.of("nickname", "tester"));
        String permsJson = objectMapper.writeValueAsString(List.of("message:read"));
        String dataJson = objectMapper.writeValueAsString(Map.of("tenantId", 1));
        String userB64 = AuthHeaderUtil.base64UrlEncode(userJson);
        String permsB64 = AuthHeaderUtil.base64UrlEncode(permsJson);
        String dataB64 = AuthHeaderUtil.base64UrlEncode(dataJson);
        String ts = String.valueOf(System.currentTimeMillis());
        String nonce = "nonce-prehandle";
        String sign = AuthHeaderUtil.signHmacSha256(
                "im-gateway-auth-secret",
                AuthHeaderUtil.buildSignedFields("1", "tester", userB64, permsB64, dataB64, ts, nonce)
        );

        when(request.getMethod()).thenReturn("POST");
        when(request.getRequestURI()).thenReturn("/api/message/send/private");
        when(request.getHeader("X-Internal-Secret")).thenReturn("im-internal-secret");
        when(request.getHeader("X-User-Id")).thenReturn("1");
        when(request.getHeader("X-Username")).thenReturn("tester");
        when(request.getHeader("X-Auth-User")).thenReturn(userB64);
        when(request.getHeader("X-Auth-Perms")).thenReturn(permsB64);
        when(request.getHeader("X-Auth-Data")).thenReturn(dataB64);
        when(request.getHeader("X-Auth-Ts")).thenReturn(ts);
        when(request.getHeader("X-Auth-Nonce")).thenReturn(nonce);
        when(request.getHeader("X-Auth-Sign")).thenReturn(sign);

        boolean ok = interceptor.preHandle(request, response, new Object());

        assertTrue(ok);
        verify(request).setAttribute("userId", 1L);
        verify(request).setAttribute("username", "tester");
    }

    private String internalSignature(String method, String path, byte[] body, String ts, String nonce) {
        return AuthHeaderUtil.signHmacSha256(
                "im-internal-secret",
                AuthHeaderUtil.buildInternalSignedFields(
                        method,
                        path,
                        AuthHeaderUtil.sha256Base64Url(body),
                        ts,
                        nonce
                )
        );
    }
}
