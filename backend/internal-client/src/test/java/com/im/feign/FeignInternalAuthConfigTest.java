package com.im.feign;

import feign.RequestTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Collection;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class FeignInternalAuthConfigTest {

    private FeignInternalAuthConfig interceptor;

    @BeforeEach
    void setUp() {
        interceptor = new FeignInternalAuthConfig();
        ReflectionTestUtils.setField(interceptor, "internalHeaderName", "X-Internal-Secret");
        ReflectionTestUtils.setField(interceptor, "internalSecret", "im-internal-secret");
        ReflectionTestUtils.setField(interceptor, "gatewayUserIdHeader", "X-User-Id");
        ReflectionTestUtils.setField(interceptor, "gatewayUsernameHeader", "X-Username");
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void apply_shouldSetInternalAndDefaultJsonHeadersWithoutRequestContext() {
        RequestTemplate template = new RequestTemplate();

        interceptor.apply(template);

        assertEquals("im-internal-secret", firstHeader(template.headers(), "X-Internal-Secret"));
        assertEquals("application/json", firstHeader(template.headers(), "Content-Type"));
        assertEquals("application/json", firstHeader(template.headers(), "Accept"));
        assertNull(firstHeader(template.headers(), "Authorization"));
        assertNull(firstHeader(template.headers(), "X-User-Id"));
        assertNull(firstHeader(template.headers(), "X-Username"));
    }

    @Test
    void apply_shouldPropagateAuthorizationAndIdentityHeaders() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer token-123");
        request.addHeader("X-User-Id", "1001");
        request.addHeader("X-Username", "alice");
        request.addHeader("X-Rate-Limit-Global-Enabled", "false");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

        RequestTemplate template = new RequestTemplate();
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

        RequestTemplate template = new RequestTemplate();
        interceptor.apply(template);

        assertEquals("2002", firstHeader(template.headers(), "X-User-Id"));
        assertEquals("bob", firstHeader(template.headers(), "X-Username"));
    }

    private String firstHeader(Map<String, Collection<String>> headers, String headerName) {
        Collection<String> values = headers.get(headerName);
        if (values == null || values.isEmpty()) {
            return null;
        }
        return values.iterator().next();
    }
}
