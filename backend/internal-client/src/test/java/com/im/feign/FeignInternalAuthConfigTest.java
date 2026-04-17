package com.im.feign;

import com.im.util.AuthHeaderUtil;
import feign.RequestTemplate;
import feign.Target;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.Map;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.*;

class FeignInternalAuthConfigTest {

    private static final Instant FIXED_INSTANT = Instant.parse("2026-04-16T00:00:00Z");

    private FeignInternalAuthConfig interceptor;

    @BeforeEach
    void setUp() {
        interceptor = new FeignInternalAuthConfig();
        ReflectionTestUtils.setField(interceptor, "internalHeaderName", "X-Internal-Secret");
        ReflectionTestUtils.setField(interceptor, "internalSecret", "im-internal-secret");
        ReflectionTestUtils.setField(interceptor, "internalLegacySecretOnlyEnabled", false);
        ReflectionTestUtils.setField(interceptor, "gatewayUserIdHeader", "X-User-Id");
        ReflectionTestUtils.setField(interceptor, "gatewayUsernameHeader", "X-Username");
        ReflectionTestUtils.setField(interceptor, "clock", Clock.fixed(FIXED_INSTANT, ZoneOffset.UTC));
        ReflectionTestUtils.setField(interceptor, "nonceSupplier", (Supplier<String>) () -> "nonce-fixed");
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void apply_shouldSetInternalSignatureAndDefaultJsonHeadersWithoutRequestContext() {
        RequestTemplate template = requestTemplate("POST", "/api/auth/internal/ws-ticket/consume", "{\"ticket\":\"abc\"}");

        interceptor.apply(template);

        assertEquals(String.valueOf(FIXED_INSTANT.toEpochMilli()), firstHeader(template.headers(), AuthHeaderUtil.INTERNAL_TIMESTAMP_HEADER));
        assertEquals("nonce-fixed", firstHeader(template.headers(), AuthHeaderUtil.INTERNAL_NONCE_HEADER));
        assertEquals(expectedSignature("POST", "/api/auth/internal/ws-ticket/consume", "{\"ticket\":\"abc\"}"),
                firstHeader(template.headers(), AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER));
        assertEquals("application/json", firstHeader(template.headers(), "Content-Type"));
        assertEquals("application/json", firstHeader(template.headers(), "Accept"));
        assertNull(firstHeader(template.headers(), "Authorization"));
        assertNull(firstHeader(template.headers(), "X-User-Id"));
        assertNull(firstHeader(template.headers(), "X-Username"));
        assertNull(firstHeader(template.headers(), "X-Internal-Secret"));
    }

    @Test
    void apply_shouldPropagateAuthorizationAndIdentityHeaders() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer token-123");
        request.addHeader("X-User-Id", "1001");
        request.addHeader("X-Username", "alice");
        request.addHeader("X-Rate-Limit-Global-Enabled", "false");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

        RequestTemplate template = requestTemplate("GET", "/api/user/internal/exists/1001", null);
        interceptor.apply(template);

        assertEquals("Bearer token-123", firstHeader(template.headers(), "Authorization"));
        assertEquals("1001", firstHeader(template.headers(), "X-User-Id"));
        assertEquals("alice", firstHeader(template.headers(), "X-Username"));
        assertEquals("false", firstHeader(template.headers(), "X-Rate-Limit-Global-Enabled"));
    }

    @Test
    void apply_shouldFallbackToRequestAttributesWhenIdentityHeadersMissing() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute("userId", 2002L);
        request.setAttribute("username", "bob");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

        RequestTemplate template = requestTemplate("GET", "/api/user/internal/exists/2002", null);
        interceptor.apply(template);

        assertEquals("2002", firstHeader(template.headers(), "X-User-Id"));
        assertEquals("bob", firstHeader(template.headers(), "X-Username"));
    }

    @Test
    void apply_shouldChangeSignatureWhenBodyChanges() {
        RequestTemplate first = requestTemplate("POST", "/internal/message/system/private", "{\"content\":\"one\"}");
        RequestTemplate second = requestTemplate("POST", "/internal/message/system/private", "{\"content\":\"two\"}");

        interceptor.apply(first);
        interceptor.apply(second);

        assertNotEquals(firstHeader(first.headers(), AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER),
                firstHeader(second.headers(), AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER));
    }

    @Test
    void apply_shouldChangeSignatureWhenPathChanges() {
        RequestTemplate first = requestTemplate("GET", "/api/user/internal/exists/1", null);
        RequestTemplate second = requestTemplate("GET", "/api/user/internal/exists/2", null);

        interceptor.apply(first);
        interceptor.apply(second);

        assertNotEquals(firstHeader(first.headers(), AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER),
                firstHeader(second.headers(), AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER));
    }

    @Test
    void apply_shouldIncludeFeignTargetBasePathWhenTemplatePathIsRelative() {
        RequestTemplate template = requestTemplate("POST", "/token", "{\"userId\":1}");
        template.feignTarget(new Target.HardCodedTarget<>(
                Object.class,
                "im-auth-service",
                "http://im-auth-service/api/auth/internal"
        ));

        interceptor.apply(template);

        assertEquals(
                expectedSignature("POST", "/api/auth/internal/token", "{\"userId\":1}"),
                firstHeader(template.headers(), AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER)
        );
    }

    private RequestTemplate requestTemplate(String method, String path, String body) {
        RequestTemplate template = new RequestTemplate();
        template.method(method);
        template.uri(path);
        if (body != null) {
            template.body(body);
        }
        return template;
    }

    private String expectedSignature(String method, String path, String body) {
        return AuthHeaderUtil.signHmacSha256(
                "im-internal-secret",
                AuthHeaderUtil.buildInternalSignedFields(
                        method,
                        path,
                        AuthHeaderUtil.sha256Base64Url(body == null ? null : body.getBytes(StandardCharsets.UTF_8)),
                        String.valueOf(FIXED_INSTANT.toEpochMilli()),
                        "nonce-fixed"
                )
        );
    }

    private String firstHeader(Map<String, Collection<String>> headers, String headerName) {
        Collection<String> values = headers.get(headerName);
        if (values == null || values.isEmpty()) {
            return null;
        }
        return values.iterator().next();
    }
}
