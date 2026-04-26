package com.im.gateway.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.AuthUserResourceDTO;
import com.im.util.AuthHeaderUtil;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class GatewayIdentityHeaderSupportTest {

    private final GatewayIdentityHeaderSupport support = new GatewayIdentityHeaderSupport(new ObjectMapper());

    @Test
    void sanitizeIncoming_ShouldRemoveClientControlledIdentityHeaders() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .header("X-User-Id", "1")
                        .header("X-Username", "mallory")
                        .header("X-Internal-Secret", "forged")
                        .header("X-Auth-User", "forged")
                        .header("X-Auth-Perms", "forged")
                        .header("X-Auth-Data", "forged")
                        .header("X-Auth-Ts", "forged")
                        .header("X-Auth-Nonce", "forged")
                        .header("X-Auth-Sign", "forged")
                        .build()
        );

        ServerWebExchange sanitized = support.sanitizeIncoming(exchange, "X-Internal-Secret");

        assertFalse(sanitized.getRequest().getHeaders().containsKey("X-User-Id"));
        assertFalse(sanitized.getRequest().getHeaders().containsKey("X-Username"));
        assertFalse(sanitized.getRequest().getHeaders().containsKey("X-Internal-Secret"));
        assertFalse(sanitized.getRequest().getHeaders().containsKey("X-Auth-Sign"));
    }

    @Test
    void decorate_ShouldInjectSignedGatewayIdentityHeaders() {
        AuthUserResourceDTO resource = new AuthUserResourceDTO();
        resource.setUserId(42L);
        resource.setUsername("alice");
        resource.setUserInfo(Map.of("nickname", "Alice"));
        resource.setResourcePermissions(List.of("message:read"));
        resource.setDataScopes(Map.of("tenantId", 1));
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/message/list").build());

        ServerWebExchange decorated = support.decorate(
                exchange,
                42L,
                "alice",
                resource,
                "X-Internal-Secret",
                "internal-secret",
                "gateway-secret",
                true
        );

        var headers = decorated.getRequest().getHeaders();
        assertEquals("42", headers.getFirst("X-User-Id"));
        assertEquals("alice", headers.getFirst("X-Username"));
        assertEquals("internal-secret", headers.getFirst("X-Internal-Secret"));
        assertEquals("true", headers.getFirst("X-Rate-Limit-Global-Enabled"));
        assertNotNull(headers.getFirst("X-Auth-User"));
        assertNotNull(headers.getFirst("X-Auth-Perms"));
        assertNotNull(headers.getFirst("X-Auth-Data"));
        assertNotNull(headers.getFirst("X-Auth-Ts"));
        assertNotNull(headers.getFirst("X-Auth-Nonce"));
        assertTrue(AuthHeaderUtil.verifyHmacSha256(
                "gateway-secret",
                AuthHeaderUtil.buildSignedFields(
                        "42",
                        "alice",
                        headers.getFirst("X-Auth-User"),
                        headers.getFirst("X-Auth-Perms"),
                        headers.getFirst("X-Auth-Data"),
                        headers.getFirst("X-Auth-Ts"),
                        headers.getFirst("X-Auth-Nonce")
                ),
                headers.getFirst("X-Auth-Sign")
        ));
    }
}
