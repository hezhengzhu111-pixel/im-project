package com.im.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.config.GlobalRateLimitSwitch;
import com.im.config.RateLimitGlobalProperties;
import com.im.dto.ApiResponse;
import com.im.dto.AuthUserResourceDTO;
import com.im.dto.TokenParseResultDTO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.ClientRequest;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JwtAuthGlobalFilterTest {

    @Mock
    private GatewayFilterChain chain;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void filterShouldBypassWhitelistPath() {
        JwtAuthGlobalFilter filter = newFilter(request -> Mono.error(new AssertionError("auth service should not be called")));
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/auth/refresh").build());
        when(chain.filter(any(ServerWebExchange.class))).thenAnswer(invocation -> {
            forwardedExchange.set(invocation.getArgument(0));
            return Mono.empty();
        });

        filter.filter(exchange, chain).block();

        verify(chain).filter(any(ServerWebExchange.class));
        assertNotNull(forwardedExchange.get());
        assertEquals("true", forwardedExchange.get().getRequest().getHeaders().getFirst(RateLimitGlobalProperties.SWITCH_HEADER));
    }

    @Test
    void filterShouldExposeDisabledGlobalSwitchHeader() {
        JwtAuthGlobalFilter filter = newFilter(
                request -> Mono.error(new AssertionError("auth service should not be called")),
                false
        );
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/auth/refresh").build());
        when(chain.filter(any(ServerWebExchange.class))).thenAnswer(invocation -> {
            forwardedExchange.set(invocation.getArgument(0));
            return Mono.empty();
        });

        filter.filter(exchange, chain).block();

        assertNotNull(forwardedExchange.get());
        assertEquals("false", forwardedExchange.get().getRequest().getHeaders().getFirst(RateLimitGlobalProperties.SWITCH_HEADER));
        assertEquals("false", exchange.getResponse().getHeaders().getFirst(RateLimitGlobalProperties.SWITCH_HEADER));
    }

    @Test
    void filterShouldRejectInternalPathWithoutForwarding() {
        JwtAuthGlobalFilter filter = newFilter(request -> Mono.error(new AssertionError("auth service should not be called")));
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/user/internal/profile")
                        .header("X-Internal-Secret", "forged-secret")
                        .build()
        );

        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
        verify(chain, never()).filter(any(ServerWebExchange.class));
    }

    @Test
    void filterShouldRejectImInternalPathWithoutForwarding() {
        JwtAuthGlobalFilter filter = newFilter(request -> Mono.error(new AssertionError("auth service should not be called")));
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.post("/api/im/offline/42")
                        .header("Authorization", "Bearer " + validJwtToken())
                        .build()
        );

        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
        verify(chain, never()).filter(any(ServerWebExchange.class));
    }

    @Test
    void filterShouldRejectCookieUnsafeRequestWithoutGatewayRouteHeader() {
        JwtAuthGlobalFilter filter = newFilter(request -> Mono.error(new AssertionError("auth service should not be called")));
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.post("/api/auth/refresh")
                        .cookie(new HttpCookie("IM_REFRESH_TOKEN", "refresh-token"))
                        .build()
        );

        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
        verify(chain, never()).filter(any(ServerWebExchange.class));
    }

    @Test
    void filterShouldRejectMissingToken() {
        JwtAuthGlobalFilter filter = newFilter(request -> Mono.error(new AssertionError("auth service should not be called")));
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/message/list").build());

        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        verify(chain, never()).filter(any(ServerWebExchange.class));
    }

    @Test
    void filterShouldRejectInvalidTokenReturnedByAuthService() {
        AtomicInteger authCalls = new AtomicInteger();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            authCalls.incrementAndGet();
            TokenParseResultDTO invalid = new TokenParseResultDTO();
            invalid.setValid(false);
            invalid.setError("invalid");
            return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(invalid)));
        });

        MockServerWebExchange exchange = exchangeWithToken(validJwtToken());
        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        assertEquals(1, authCalls.get());
    }

    @Test
    void filterShouldNotCacheInvalidToken() {
        AtomicInteger validateCalls = new AtomicInteger();
        String token = validJwtToken();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            validateCalls.incrementAndGet();
            TokenParseResultDTO invalid = new TokenParseResultDTO();
            invalid.setValid(false);
            invalid.setError("invalid");
            return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(invalid)));
        });

        MockServerWebExchange firstExchange = exchangeWithToken(token);
        filter.filter(firstExchange, chain).block();
        MockServerWebExchange secondExchange = exchangeWithToken(token);
        filter.filter(secondExchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, firstExchange.getResponse().getStatusCode());
        assertEquals(HttpStatus.UNAUTHORIZED, secondExchange.getResponse().getStatusCode());
        assertEquals(2, validateCalls.get());
    }

    @Test
    void filterShouldMapAuthServiceTimeoutTo504() {
        AtomicInteger validateCalls = new AtomicInteger();
        String token = validJwtToken();
        JwtAuthGlobalFilter filter = newFilter(
                request -> {
                    validateCalls.incrementAndGet();
                    return Mono.never();
                },
                "http://im-auth-service",
                50
        );

        MockServerWebExchange firstExchange = exchangeWithToken(token);
        filter.filter(firstExchange, chain).block();
        MockServerWebExchange secondExchange = exchangeWithToken(token);
        filter.filter(secondExchange, chain).block();

        assertEquals(HttpStatus.GATEWAY_TIMEOUT, firstExchange.getResponse().getStatusCode());
        assertEquals(HttpStatus.GATEWAY_TIMEOUT, secondExchange.getResponse().getStatusCode());
        assertEquals(2, validateCalls.get());
    }

    @Test
    void filterShouldMapTransportLevelFailuresTo503WithoutNegativeCaching() {
        AtomicInteger validateCalls = new AtomicInteger();
        String token = validJwtToken();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            validateCalls.incrementAndGet();
            return Mono.just(ClientResponse.create(HttpStatus.FORBIDDEN).build());
        });

        MockServerWebExchange firstExchange = exchangeWithToken(token);
        filter.filter(firstExchange, chain).block();
        MockServerWebExchange secondExchange = exchangeWithToken(token);
        filter.filter(secondExchange, chain).block();

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, firstExchange.getResponse().getStatusCode());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, secondExchange.getResponse().getStatusCode());
        assertEquals(2, validateCalls.get());
    }

    @Test
    void filterShouldInjectAuthHeadersAndCacheSuccessfulValidationResult() {
        AtomicInteger validateCalls = new AtomicInteger();
        AtomicInteger resourceCalls = new AtomicInteger();
        AtomicReference<ClientRequest> validateRequest = new AtomicReference<>();
        AtomicReference<ClientRequest> resourceRequest = new AtomicReference<>();
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        String token = validJwtToken();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            String path = request.url().getPath();
            if ("/api/auth/internal/validate-token".equals(path)) {
                validateCalls.incrementAndGet();
                validateRequest.set(request);
                return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(validToken(2001L, "neo"))));
            }
            if ("/api/auth/internal/user-resource/2001".equals(path)) {
                resourceCalls.incrementAndGet();
                resourceRequest.set(request);
                return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(userResource(2001L, "neo"))));
            }
            return Mono.error(new AssertionError("unexpected path: " + path));
        });
        when(chain.filter(any(ServerWebExchange.class))).thenAnswer(invocation -> {
            forwardedExchange.set(invocation.getArgument(0));
            return Mono.empty();
        });

        MockServerWebExchange firstExchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .header("Authorization", "Bearer " + token)
                        .header("X-Internal-Secret", "forged-secret")
                        .build()
        );
        filter.filter(firstExchange, chain).block();
        MockServerWebExchange secondExchange = exchangeWithToken(token);
        filter.filter(secondExchange, chain).block();

        assertNotNull(validateRequest.get());
        assertNotNull(resourceRequest.get());
        assertNotNull(forwardedExchange.get());
        assertEquals(HttpMethod.POST, validateRequest.get().method());
        assertEquals("/api/auth/internal/user-resource/2001", resourceRequest.get().url().getPath());
        assertEquals(1, validateCalls.get());
        assertEquals(1, resourceCalls.get());

        ServerHttpRequest request = forwardedExchange.get().getRequest();
        assertEquals("2001", request.getHeaders().getFirst("X-User-Id"));
        assertEquals("neo", request.getHeaders().getFirst("X-Username"));
        assertEquals("internal-value", request.getHeaders().getFirst("X-Internal-Secret"));
        assertFalse("forged-secret".equals(request.getHeaders().getFirst("X-Internal-Secret")));
        assertTrue(request.getHeaders().containsKey("X-Auth-User"));
        assertTrue(request.getHeaders().containsKey("X-Auth-Perms"));
        assertTrue(request.getHeaders().containsKey("X-Auth-Data"));
    }

    @Test
    void filterShouldNotCachePartialFailureWhenUserResourceLoadFails() {
        AtomicInteger validateCalls = new AtomicInteger();
        AtomicInteger resourceCalls = new AtomicInteger();
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        String token = validJwtToken();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            String path = request.url().getPath();
            if ("/api/auth/internal/validate-token".equals(path)) {
                validateCalls.incrementAndGet();
                return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(validToken(7001L, "switch"))));
            }
            if ("/api/auth/internal/user-resource/7001".equals(path)) {
                if (resourceCalls.incrementAndGet() == 1) {
                    return Mono.just(ClientResponse.create(HttpStatus.INTERNAL_SERVER_ERROR).build());
                }
                return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(userResource(7001L, "switch"))));
            }
            return Mono.error(new AssertionError("unexpected path: " + path));
        });
        when(chain.filter(any(ServerWebExchange.class))).thenAnswer(invocation -> {
            forwardedExchange.set(invocation.getArgument(0));
            return Mono.empty();
        });

        MockServerWebExchange firstExchange = exchangeWithToken(token);
        filter.filter(firstExchange, chain).block();
        MockServerWebExchange secondExchange = exchangeWithToken(token);
        filter.filter(secondExchange, chain).block();

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, firstExchange.getResponse().getStatusCode());
        assertEquals(2, validateCalls.get());
        assertEquals(2, resourceCalls.get());
        assertNotNull(forwardedExchange.get());
        assertEquals("7001", forwardedExchange.get().getRequest().getHeaders().getFirst("X-User-Id"));
    }

    @Test
    void filterShouldAcceptTokenFromCookie() {
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        JwtAuthGlobalFilter filter = newFilter(request -> successResponseForPath(request, 8101L, "cookie"));
        when(chain.filter(any(ServerWebExchange.class))).thenAnswer(invocation -> {
            forwardedExchange.set(invocation.getArgument(0));
            return Mono.empty();
        });

        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .cookie(new HttpCookie("IM_ACCESS_TOKEN", validJwtToken()))
                        .build()
        );

        filter.filter(exchange, chain).block();

        assertNotNull(forwardedExchange.get());
        assertEquals("8101", forwardedExchange.get().getRequest().getHeaders().getFirst("X-User-Id"));
    }

    private JwtAuthGlobalFilter newFilter(ExchangeFunction exchangeFunction) {
        return newFilter(exchangeFunction, true);
    }

    private JwtAuthGlobalFilter newFilter(ExchangeFunction exchangeFunction, boolean switchEnabled) {
        return newFilter(exchangeFunction, "http://im-auth-service", 200, switchEnabled);
    }

    private JwtAuthGlobalFilter newFilter(ExchangeFunction exchangeFunction,
                                          String authServiceUrl,
                                          long requestTimeoutMs) {
        return newFilter(exchangeFunction, authServiceUrl, requestTimeoutMs, true);
    }

    private JwtAuthGlobalFilter newFilter(ExchangeFunction exchangeFunction,
                                          String authServiceUrl,
                                          long requestTimeoutMs,
                                          boolean switchEnabled) {
        MockEnvironment environment = new MockEnvironment();
        environment.setProperty(RateLimitGlobalProperties.ENABLED_KEY, Boolean.toString(switchEnabled));
        GlobalRateLimitSwitch globalRateLimitSwitch = new GlobalRateLimitSwitch(environment, new RateLimitGlobalProperties());
        globalRateLimitSwitch.refreshFromEnvironment();
        JwtAuthGlobalFilter filter = new JwtAuthGlobalFilter(
                objectMapper,
                globalRateLimitSwitch,
                authServiceUrl,
                requestTimeoutMs,
                exchangeFunction
        );
        ReflectionTestUtils.setField(filter, "internalHeaderName", "X-Internal-Secret");
        ReflectionTestUtils.setField(filter, "internalSecret", "internal-value");
        ReflectionTestUtils.setField(filter, "gatewayAuthSecret", "gateway-secret");
        ReflectionTestUtils.setField(filter, "tokenRevocationCheckEnabled", true);
        ReflectionTestUtils.setField(filter, "jwtHeader", "Authorization");
        ReflectionTestUtils.setField(filter, "jwtPrefix", "Bearer ");
        ReflectionTestUtils.setField(filter, "accessTokenCookieName", "IM_ACCESS_TOKEN");
        ReflectionTestUtils.setField(filter, "refreshTokenCookieName", "IM_REFRESH_TOKEN");
        return filter;
    }

    private MockServerWebExchange exchangeWithToken(String token) {
        return MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .header("Authorization", "Bearer " + token)
                        .build()
        );
    }

    private Mono<ClientResponse> successResponseForPath(ClientRequest request, Long userId, String username) {
        String path = request.url().getPath();
        if ("/api/auth/internal/validate-token".equals(path)) {
            return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(validToken(userId, username))));
        }
        if (("/api/auth/internal/user-resource/" + userId).equals(path)) {
            return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(userResource(userId, username))));
        }
        return Mono.error(new AssertionError("unexpected path: " + path));
    }

    private ClientResponse jsonResponse(HttpStatus status, Object body) {
        try {
            return ClientResponse.create(status)
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .body(objectMapper.writeValueAsString(body))
                    .build();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private String validJwtToken() {
        return Base64.getUrlEncoder().withoutPadding().encodeToString("valid-token".getBytes());
    }

    private TokenParseResultDTO validToken(Long userId, String username) {
        TokenParseResultDTO dto = new TokenParseResultDTO();
        dto.setValid(true);
        dto.setExpired(false);
        dto.setUserId(userId);
        dto.setUsername(username);
        return dto;
    }

    private AuthUserResourceDTO userResource(Long userId, String username) {
        AuthUserResourceDTO dto = new AuthUserResourceDTO();
        dto.setUserId(userId);
        dto.setUsername(username);
        dto.setUserInfo(Map.of("nickname", username));
        dto.setResourcePermissions(List.of("message:read"));
        dto.setDataScopes(Map.of("tenantId", 1));
        return dto;
    }
}
