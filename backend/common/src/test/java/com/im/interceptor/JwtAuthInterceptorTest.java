package com.im.interceptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.util.ReflectionTestUtils;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JwtAuthInterceptorTest {

    @Mock
    private ObjectMapper objectMapper;
    @Mock
    private ObjectProvider<org.springframework.data.redis.core.StringRedisTemplate> redisTemplateProvider;
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
        ReflectionTestUtils.setField(interceptor, "gatewayFallbackJwtEnabled", false);
        ReflectionTestUtils.setField(interceptor, "internalHeaderName", "X-Internal-Secret");
        ReflectionTestUtils.setField(interceptor, "internalSecret", "im-internal-secret");
        ReflectionTestUtils.setField(interceptor, "gatewayUserIdHeader", "X-User-Id");
        ReflectionTestUtils.setField(interceptor, "gatewayUsernameHeader", "X-Username");
        ReflectionTestUtils.setField(interceptor, "maxSkewMs", 300000L);
        ReflectionTestUtils.setField(interceptor, "replayProtectionEnabled", true);
        ReflectionTestUtils.setField(interceptor, "gatewayAuthSecret", "im-gateway-auth-secret");
    }

    @Test
    void applyIdentityFromGatewayHeaders_shouldPassWithMinimalHeaders() {
        when(request.getHeader("X-Internal-Secret")).thenReturn("im-internal-secret");
        when(request.getHeader("X-User-Id")).thenReturn("1");
        when(request.getHeader("X-Username")).thenReturn("tester");

        boolean ok = ReflectionTestUtils.invokeMethod(interceptor, "applyIdentityFromGatewayHeaders", request);

        assertTrue(ok);
        verify(request).setAttribute("userId", 1L);
        verify(request).setAttribute("username", "tester");
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
    void preHandle_shouldAllowServiceWhitelist() throws Exception {
        when(request.getMethod()).thenReturn("GET");
        when(request.getRequestURI()).thenReturn("/actuator/health");

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
}
