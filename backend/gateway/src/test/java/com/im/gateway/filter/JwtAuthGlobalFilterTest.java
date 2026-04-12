package com.im.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.ApiResponse;
import com.im.dto.AuthUserResourceDTO;
import com.im.dto.TokenParseResultDTO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.ClientRequest;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
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
    void filterShouldRejectMissingToken() {
        JwtAuthGlobalFilter filter = newFilter(request -> Mono.error(new AssertionError("auth service should not be called")));
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/message/list").build());

        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        verify(chain, never()).filter(any(ServerWebExchange.class));
    }

    @Test
    void filterShouldRejectMalformedTokenWithoutCallingAuthService() {
        AtomicInteger authCalls = new AtomicInteger();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            authCalls.incrementAndGet();
            return Mono.error(new AssertionError("auth service should not be called"));
        });

        MockServerWebExchange exchange = exchangeWithToken("bad-token");
        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        assertEquals(0, authCalls.get());
    }

    @Test
    void filterShouldRejectExpiredTokenWithoutCallingAuthService() {
        AtomicInteger authCalls = new AtomicInteger();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            authCalls.incrementAndGet();
            return Mono.error(new AssertionError("auth service should not be called"));
        });

        MockServerWebExchange exchange = exchangeWithToken(jwtTokenWithExp(Instant.now().minusSeconds(5).getEpochSecond()));
        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        assertEquals(0, authCalls.get());
    }

    @Test
    void filterShouldNegativeCacheInvalidToken() {
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
        assertEquals(1, validateCalls.get());
    }

    @Test
    void filterShouldRetryAfterNegativeCacheExpires() {
        AtomicInteger validateCalls = new AtomicInteger();
        String token = validJwtToken();
        JwtAuthGlobalFilter filter = newFilter(
                request -> {
                    validateCalls.incrementAndGet();
                    TokenParseResultDTO invalid = new TokenParseResultDTO();
                    invalid.setValid(false);
                    invalid.setExpired(true);
                    invalid.setError("expired");
                    return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(invalid)));
                },
                request -> Mono.error(new AssertionError("load balanced client should not be called")),
                "http://im-auth-service",
                200,
                10,
                1,
                15
        );

        MockServerWebExchange firstExchange = exchangeWithToken(token);
        filter.filter(firstExchange, chain).block();
        Mono.delay(Duration.ofMillis(1100)).block();
        MockServerWebExchange secondExchange = exchangeWithToken(token);
        filter.filter(secondExchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, firstExchange.getResponse().getStatusCode());
        assertEquals(HttpStatus.UNAUTHORIZED, secondExchange.getResponse().getStatusCode());
        assertEquals(2, validateCalls.get());
    }

    @Test
    void filterShouldMapAuthServiceTimeoutTo504WithoutNegativeCaching() {
        AtomicInteger validateCalls = new AtomicInteger();
        String token = validJwtToken();
        JwtAuthGlobalFilter filter = newFilter(
                request -> {
                    validateCalls.incrementAndGet();
                    return Mono.never();
                },
                request -> Mono.error(new AssertionError("load balanced client should not be called")),
                "http://im-auth-service",
                50,
                10,
                5,
                15
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
    void filterShouldInjectAuthHeadersAndCacheSuccessfulValidation() {
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
    void filterShouldNotCacheFailedUserResourceLoad() {
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
        assertEquals(1, validateCalls.get());
        assertEquals(2, resourceCalls.get());
        assertNotNull(forwardedExchange.get());
        assertEquals("7001", forwardedExchange.get().getRequest().getHeaders().getFirst("X-User-Id"));
    }

    @Test
    void filterShouldReuseInflightRequestsForSameTokenAndUserResource() {
        AtomicInteger validateCalls = new AtomicInteger();
        AtomicInteger resourceCalls = new AtomicInteger();
        String token = validJwtToken();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            String path = request.url().getPath();
            if ("/api/auth/internal/validate-token".equals(path)) {
                return Mono.defer(() -> {
                    validateCalls.incrementAndGet();
                    return Mono.delay(Duration.ofMillis(80))
                            .map(ignore -> jsonResponse(HttpStatus.OK, ApiResponse.success(validToken(9001L, "morpheus"))));
                });
            }
            if ("/api/auth/internal/user-resource/9001".equals(path)) {
                return Mono.defer(() -> {
                    resourceCalls.incrementAndGet();
                    return Mono.delay(Duration.ofMillis(80))
                            .map(ignore -> jsonResponse(HttpStatus.OK, ApiResponse.success(userResource(9001L, "morpheus"))));
                });
            }
            return Mono.error(new AssertionError("unexpected path: " + path));
        });
        when(chain.filter(any(ServerWebExchange.class))).thenReturn(Mono.empty());

        Mono.when(
                filter.filter(exchangeWithToken(token), chain),
                filter.filter(exchangeWithToken(token), chain)
        ).block();

        assertEquals(1, validateCalls.get());
        assertEquals(1, resourceCalls.get());
    }

    @Test
    void filterShouldUsePlainBuilderForHttpAuthServiceUrl() {
        AtomicInteger plainCalls = new AtomicInteger();
        AtomicInteger lbCalls = new AtomicInteger();
        JwtAuthGlobalFilter filter = newFilter(
                request -> {
                    plainCalls.incrementAndGet();
                    return successResponseForPath(request, 8101L, "plain");
                },
                request -> {
                    lbCalls.incrementAndGet();
                    return Mono.error(new AssertionError("load balanced client should not be called"));
                },
                "http://im-auth-service",
                200,
                10,
                5,
                15
        );
        when(chain.filter(any(ServerWebExchange.class))).thenReturn(Mono.empty());

        filter.filter(exchangeWithToken(validJwtToken()), chain).block();

        assertEquals(2, plainCalls.get());
        assertEquals(0, lbCalls.get());
    }

    @Test
    void filterShouldUseLoadBalancedBuilderForLbAuthServiceUrl() {
        AtomicInteger plainCalls = new AtomicInteger();
        AtomicInteger lbCalls = new AtomicInteger();
        JwtAuthGlobalFilter filter = newFilter(
                request -> {
                    plainCalls.incrementAndGet();
                    return Mono.error(new AssertionError("plain client should not be called"));
                },
                request -> {
                    lbCalls.incrementAndGet();
                    return successResponseForPath(request, 8201L, "balanced");
                },
                "lb://im-auth-service",
                200,
                10,
                5,
                15
        );
        when(chain.filter(any(ServerWebExchange.class))).thenReturn(Mono.empty());

        filter.filter(exchangeWithToken(validJwtToken()), chain).block();

        assertEquals(0, plainCalls.get());
        assertEquals(2, lbCalls.get());
    }

    private JwtAuthGlobalFilter newFilter(ExchangeFunction exchangeFunction) {
        return newFilter(exchangeFunction, exchangeFunction, "http://im-auth-service", 200, 10, 5, 15);
    }

    private JwtAuthGlobalFilter newFilter(ExchangeFunction plainExchangeFunction,
                                          ExchangeFunction loadBalancedExchangeFunction,
                                          String authServiceUrl,
                                          long requestTimeoutMs,
                                          long tokenCacheTtlSeconds,
                                          long negativeCacheTtlSeconds,
                                          long userResourceCacheTtlSeconds) {
        WebClient.Builder plainBuilder = WebClient.builder().exchangeFunction(plainExchangeFunction);
        WebClient.Builder loadBalancedBuilder = WebClient.builder().exchangeFunction(loadBalancedExchangeFunction);
        JwtAuthGlobalFilter filter = new JwtAuthGlobalFilter(
                objectMapper,
                plainBuilder,
                loadBalancedBuilder,
                authServiceUrl,
                requestTimeoutMs,
                tokenCacheTtlSeconds,
                negativeCacheTtlSeconds,
                userResourceCacheTtlSeconds
        );
        ReflectionTestUtils.setField(filter, "internalHeaderName", "X-Internal-Secret");
        ReflectionTestUtils.setField(filter, "internalSecret", "internal-value");
        ReflectionTestUtils.setField(filter, "gatewayAuthSecret", "gateway-secret");
        ReflectionTestUtils.setField(filter, "tokenRevocationCheckEnabled", true);
        ReflectionTestUtils.setField(filter, "jwtHeader", "Authorization");
        ReflectionTestUtils.setField(filter, "jwtPrefix", "Bearer ");
        ReflectionTestUtils.setField(filter, "accessTokenCookieName", "IM_ACCESS_TOKEN");
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
        return jwtTokenWithExp(Instant.now().plusSeconds(3600).getEpochSecond());
    }

    private String jwtTokenWithExp(long expEpochSeconds) {
        try {
            String header = Base64.getUrlEncoder().withoutPadding().encodeToString(
                    objectMapper.writeValueAsBytes(Map.of("alg", "HS512", "typ", "JWT"))
            );
            String payload = Base64.getUrlEncoder().withoutPadding().encodeToString(
                    objectMapper.writeValueAsBytes(Map.of("sub", "user", "exp", expEpochSeconds))
            );
            String signature = Base64.getUrlEncoder().withoutPadding().encodeToString("sig".getBytes(StandardCharsets.UTF_8));
            return header + "." + payload + "." + signature;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
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
