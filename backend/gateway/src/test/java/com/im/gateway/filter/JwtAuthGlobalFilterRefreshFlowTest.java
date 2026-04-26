package com.im.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.config.GlobalRateLimitSwitch;
import com.im.config.RateLimitGlobalProperties;
import com.im.dto.ApiResponse;
import com.im.dto.AuthIntrospectResultDTO;
import com.im.enums.AuthErrorCode;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.ClientRequest;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class JwtAuthGlobalFilterRefreshFlowTest {

    private static final String ACCESS_SECRET = "im-access-secret-im-access-secret-im-access-secret-im-access-secret";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void expiredAccessTokenShouldReturnTokenExpiredAndRetryWithFreshTokenShouldPass() {
        AuthFlowFixture fixture = new AuthFlowFixture();
        String expiredAccessToken = fixture.accessToken(3001L, "switch-user", -1_000L);

        MockServerWebExchange expiredExchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .header("Authorization", "Bearer " + expiredAccessToken)
                        .header("X-Gateway-Route", "true")
                        .build()
        );
        fixture.gatewayFilter.filter(expiredExchange, exchange -> {
            throw new AssertionError("expired request should not reach downstream chain");
        }).block();

        assertEquals(HttpStatus.UNAUTHORIZED, expiredExchange.getResponse().getStatusCode());
        String expiredBody = expiredExchange.getResponse().getBodyAsString().block();
        assertNotNull(expiredBody);
        assertTrue(expiredBody.contains("TOKEN_EXPIRED"));
        assertTrue(fixture.calledPaths.contains("/api/auth/internal/introspect"));
        assertFalse(fixture.calledPaths.contains("/api/auth/refresh"));

        String refreshedAccessToken = fixture.accessToken(3001L, "switch-user", 60_000L);

        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        MockServerWebExchange retryExchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .header("Authorization", "Bearer " + refreshedAccessToken)
                        .header("X-Gateway-Route", "true")
                        .build()
        );
        fixture.gatewayFilter.filter(retryExchange, exchange -> {
            forwardedExchange.set(exchange);
            return Mono.empty();
        }).block();

        assertNotNull(forwardedExchange.get());
        assertEquals("3001", forwardedExchange.get().getRequest().getHeaders().getFirst("X-User-Id"));
        assertEquals("switch-user", forwardedExchange.get().getRequest().getHeaders().getFirst("X-Username"));
    }

    private final class AuthFlowFixture {
        private final List<String> calledPaths = new ArrayList<>();
        private final JwtAuthGlobalFilter gatewayFilter;
        private int introspectCalls;

        private AuthFlowFixture() {
            ExchangeFunction exchangeFunction = this::exchange;
            MockEnvironment environment = new MockEnvironment();
            environment.setProperty(RateLimitGlobalProperties.ENABLED_KEY, "true");
            GlobalRateLimitSwitch switchConfig = new GlobalRateLimitSwitch(environment, new RateLimitGlobalProperties());
            switchConfig.refreshFromEnvironment();
            this.gatewayFilter = new JwtAuthGlobalFilter(objectMapper, switchConfig, "http://im-auth-service", 200, exchangeFunction);
            ReflectionTestUtils.setField(gatewayFilter, "internalHeaderName", "X-Internal-Secret");
            ReflectionTestUtils.setField(gatewayFilter, "internalSecret", "internal-value");
            ReflectionTestUtils.setField(gatewayFilter, "gatewayAuthSecret", "gateway-secret");
            ReflectionTestUtils.setField(gatewayFilter, "jwtHeader", "Authorization");
            ReflectionTestUtils.setField(gatewayFilter, "jwtPrefix", "Bearer ");
            ReflectionTestUtils.setField(gatewayFilter, "accessTokenCookieName", "IM_ACCESS_TOKEN");
            ReflectionTestUtils.setField(gatewayFilter, "refreshTokenCookieName", "IM_REFRESH_TOKEN");
        }

        private Mono<ClientResponse> exchange(ClientRequest request) {
            String path = request.url().getPath();
            calledPaths.add(path);
            if ("/api/auth/internal/introspect".equals(path)) {
                try {
                    introspectCalls++;
                    if (introspectCalls == 1) {
                        return Mono.just(ClientResponse.create(HttpStatus.UNAUTHORIZED)
                                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                                .body(objectMapper.writeValueAsString(ApiResponse.error(AuthErrorCode.TOKEN_EXPIRED)))
                                .build());
                    }
                    AuthIntrospectResultDTO dto = new AuthIntrospectResultDTO();
                    dto.setValid(true);
                    dto.setExpired(false);
                    dto.setUserId(3001L);
                    dto.setUsername("switch-user");
                    dto.setExpiresAtEpochMs(System.currentTimeMillis() + 60_000L);
                    dto.setUserInfo(Map.of("nickname", "switch-user"));
                    dto.setResourcePermissions(List.of("message:read"));
                    dto.setDataScopes(Map.of("tenantId", 1));
                    return Mono.just(ClientResponse.create(HttpStatus.OK)
                            .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                            .body(objectMapper.writeValueAsString(ApiResponse.success(dto)))
                            .build());
                } catch (Exception ex) {
                    throw new RuntimeException(ex);
                }
            }
            throw new AssertionError("unexpected auth-service path: " + path);
        }

        private String accessToken(Long userId, String username, long expirationDeltaMs) {
            Date now = new Date();
            Map<String, Object> claims = new HashMap<>();
            claims.put("userId", userId);
            claims.put("username", username);
            claims.put("typ", "access");
            claims.put("jti", UUID.randomUUID().toString());
            return Jwts.builder()
                    .setClaims(claims)
                    .setSubject(username)
                    .setIssuedAt(now)
                    .setExpiration(new Date(now.getTime() + expirationDeltaMs))
                    .signWith(com.im.util.JwtLocalTokenValidator.getSecretKey(ACCESS_SECRET), SignatureAlgorithm.HS512)
                    .compact();
        }
    }
}
