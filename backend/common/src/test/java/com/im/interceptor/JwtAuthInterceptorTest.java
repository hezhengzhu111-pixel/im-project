package com.im.interceptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.util.AuthHeaderUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
    void applyIdentityFromGatewayHeaders_shouldFailWhenSignedHeadersMissing() {
        when(request.getHeader("X-Internal-Secret")).thenReturn("im-internal-secret");
        when(request.getHeader("X-User-Id")).thenReturn("1");
        when(request.getHeader("X-Username")).thenReturn("tester");

        boolean ok = ReflectionTestUtils.invokeMethod(interceptor, "applyIdentityFromGatewayHeaders", request);

        assertFalse(ok);
    }

    @Test
    void applyIdentityFromGatewayHeaders_shouldFailOnIncompleteSignedHeaders() {
        when(request.getHeader("X-Internal-Secret")).thenReturn("im-internal-secret");
        when(request.getHeader("X-User-Id")).thenReturn("1");
        when(request.getHeader("X-Username")).thenReturn("tester");
        when(request.getHeader("X-Auth-User")).thenReturn("e30");

        boolean ok = ReflectionTestUtils.invokeMethod(interceptor, "applyIdentityFromGatewayHeaders", request);

        assertFalse(ok);
    }

    @Test
    void applyIdentityFromGatewayHeaders_shouldPassWithCompleteSignedHeaders() throws Exception {
        String userJson = objectMapper.writeValueAsString(Map.of("nickname", "tester"));
        String permsJson = objectMapper.writeValueAsString(List.of("message:read"));
        String dataJson = objectMapper.writeValueAsString(Map.of("tenantId", 1));
        String userB64 = AuthHeaderUtil.base64UrlEncode(userJson);
        String permsB64 = AuthHeaderUtil.base64UrlEncode(permsJson);
        String dataB64 = AuthHeaderUtil.base64UrlEncode(dataJson);
        String ts = String.valueOf(System.currentTimeMillis());
        String nonce = "nonce-1";
        String sign = AuthHeaderUtil.signHmacSha256(
                "im-gateway-auth-secret",
                AuthHeaderUtil.buildSignedFields("1", "tester", userB64, permsB64, dataB64, ts, nonce)
        );

        when(request.getHeader("X-Internal-Secret")).thenReturn("im-internal-secret");
        when(request.getHeader("X-User-Id")).thenReturn("1");
        when(request.getHeader("X-Username")).thenReturn("tester");
        when(request.getHeader("X-Auth-User")).thenReturn(userB64);
        when(request.getHeader("X-Auth-Perms")).thenReturn(permsB64);
        when(request.getHeader("X-Auth-Data")).thenReturn(dataB64);
        when(request.getHeader("X-Auth-Ts")).thenReturn(ts);
        when(request.getHeader("X-Auth-Nonce")).thenReturn(nonce);
        when(request.getHeader("X-Auth-Sign")).thenReturn(sign);

        boolean ok = ReflectionTestUtils.invokeMethod(interceptor, "applyIdentityFromGatewayHeaders", request);

        assertTrue(ok);
        verify(request).setAttribute("userId", 1L);
        verify(request).setAttribute("username", "tester");
        verify(request).setAttribute("authUserInfo", Map.of("nickname", "tester"));
        verify(request).setAttribute("authPermissions", List.of("message:read"));
        verify(request).setAttribute("authDataScopes", Map.of("tenantId", 1));
    }

    @Test
    void tryAcquireReplayGuard_shouldExtendTtlToCoverAllowedWindow() {
        long ts = System.currentTimeMillis() + 300000L;
        long before = System.currentTimeMillis();

        boolean ok = ReflectionTestUtils.invokeMethod(interceptor, "tryAcquireReplayGuard", "1", ts, "nonce-ttl");

        long after = System.currentTimeMillis();
        long lowerBound = Math.max(300L, Math.max(1L, (ts + 300000L - after) / 1000L)) + 10L;
        long upperBound = Math.max(300L, Math.max(1L, (ts + 300000L - before) / 1000L)) + 10L;

        assertTrue(ok);
        verify(valueOperations).setIfAbsent(eq("im:auth:replay:1:" + ts + ":nonce-ttl"), eq("1"), any(Duration.class));
        assertTrue(capturedTtlSeconds() >= lowerBound && capturedTtlSeconds() <= upperBound);
    }

    @Test
    void preHandle_shouldAllowServiceWhitelist() throws Exception {
        when(request.getMethod()).thenReturn("GET");
        when(request.getRequestURI()).thenReturn("/actuator/health");

        boolean ok = interceptor.preHandle(request, response, new Object());

        assertTrue(ok);
    }

    @Test
    void preHandle_shouldAllowAuthParseProbe() throws Exception {
        when(request.getMethod()).thenReturn("POST");
        when(request.getRequestURI()).thenReturn("/auth/parse");

        boolean ok = interceptor.preHandle(request, response, new Object());

        assertTrue(ok);
    }

    @Test
    void preHandle_shouldAllowInternalSecretPath() throws Exception {
        when(request.getMethod()).thenReturn("POST");
        when(request.getRequestURI()).thenReturn("/api/im/online-status");
        when(request.getHeader("X-Internal-Secret")).thenReturn("im-internal-secret");

        boolean ok = interceptor.preHandle(request, response, new Object());

        assertTrue(ok);
    }

    private long capturedTtlSeconds() {
        return org.mockito.Mockito.mockingDetails(valueOperations)
                .getInvocations()
                .stream()
                .filter(invocation -> "setIfAbsent".equals(invocation.getMethod().getName()))
                .map(invocation -> (Duration) invocation.getArguments()[2])
                .findFirst()
                .orElseThrow()
                .getSeconds();
    }
}
