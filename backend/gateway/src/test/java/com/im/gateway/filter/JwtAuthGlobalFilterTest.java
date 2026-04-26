package com.im.gateway.filter;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.config.GlobalRateLimitSwitch;
import com.im.config.RateLimitGlobalProperties;
import com.im.dto.ApiResponse;
import com.im.dto.AuthIntrospectResultDTO;
import com.im.enums.AuthErrorCode;
import com.im.util.AuthHeaderUtil;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.*;
import org.springframework.http.server.reactive.ServerHttpRequest;
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
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static com.im.util.AuthHeaderUtil.*;
import static com.im.util.JwtLocalTokenValidator.getSecretKey;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class JwtAuthGlobalFilterTest {

    private static final String ACCESS_SECRET = "im-access-secret-im-access-secret-im-access-secret-im-access-secret";

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
                        .header("Authorization", "Bearer " + accessToken(2001L, "neo", 60_000L))
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
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .header("X-Gateway-Route", "true")
                        .build()
        );

        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        verify(chain, never()).filter(any(ServerWebExchange.class));
    }

    @Test
    void filterShouldRejectProtectedHttpPathWithoutGatewayRouteHeader() {
        JwtAuthGlobalFilter filter = newFilter(request -> Mono.error(new AssertionError("auth service should not be called")));
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .header("Authorization", "Bearer " + accessToken(2001L, "neo", 60_000L))
                        .build()
        );

        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.BAD_REQUEST, exchange.getResponse().getStatusCode());
        verify(chain, never()).filter(any(ServerWebExchange.class));
    }

    @Test
    void filterShouldRejectExpiredTokenWhenAuthServiceRejects() throws Exception {
        List<String> calledPaths = new ArrayList<>();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            calledPaths.add(request.url().getPath());
            if ("/api/auth/internal/introspect".equals(request.url().getPath())) {
                return Mono.just(jsonResponse(HttpStatus.UNAUTHORIZED, ApiResponse.error(AuthErrorCode.TOKEN_EXPIRED)));
            }
            return Mono.error(new AssertionError("unexpected path: " + request.url().getPath()));
        });

        MockServerWebExchange exchange = exchangeWithToken(accessToken(2002L, "expired", -1_000L));
        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        Map<String, Object> body = responseBody(exchange);
        assertEquals(40101, body.get("code"));
        assertEquals("TOKEN_EXPIRED", body.get("message"));
        assertEquals(List.of("/api/auth/internal/introspect"), calledPaths);
        verify(chain, never()).filter(any(ServerWebExchange.class));
    }

    @Test
    void filterShouldRejectInvalidTokenWhenAuthServiceRejects() throws Exception {
        List<String> calledPaths = new ArrayList<>();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            calledPaths.add(request.url().getPath());
            if ("/api/auth/internal/introspect".equals(request.url().getPath())) {
                return Mono.just(jsonResponse(HttpStatus.UNAUTHORIZED, ApiResponse.error(AuthErrorCode.TOKEN_INVALID)));
            }
            return Mono.error(new AssertionError("unexpected path: " + request.url().getPath()));
        });

        MockServerWebExchange exchange = exchangeWithToken(accessToken(2003L, "invalid", 60_000L) + "tampered");
        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        Map<String, Object> body = responseBody(exchange);
        assertEquals(40102, body.get("code"));
        assertEquals("TOKEN_INVALID", body.get("message"));
        assertEquals(List.of("/api/auth/internal/introspect"), calledPaths);
        verify(chain, never()).filter(any(ServerWebExchange.class));
    }

    @Test
    void filterShouldRejectMalformedAuthServiceIntrospectionData() throws Exception {
        List<String> calledPaths = new ArrayList<>();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            calledPaths.add(request.url().getPath());
            if ("/api/auth/internal/introspect".equals(request.url().getPath())) {
                AuthIntrospectResultDTO dto = introspect(null, "missing", 60_000L);
                return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(dto)));
            }
            return Mono.error(new AssertionError("unexpected path: " + request.url().getPath()));
        });

        MockServerWebExchange exchange = exchangeWithToken(accessTokenMissingJti(2004L, "missing"));
        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        Map<String, Object> body = responseBody(exchange);
        assertEquals(40102, body.get("code"));
        assertEquals("TOKEN_INVALID", body.get("message"));
        assertEquals(List.of("/api/auth/internal/introspect"), calledPaths);
    }

    @Test
    void filterShouldMapIntrospectTimeoutTo504() {
        AtomicInteger introspectCalls = new AtomicInteger();
        String token = accessToken(2101L, "timeout", 60_000L);
        JwtAuthGlobalFilter filter = newFilter(
                request -> {
                    introspectCalls.incrementAndGet();
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
        assertEquals(2, introspectCalls.get());
    }

    @Test
    void filterShouldMapIntrospectTransportFailuresTo503WithoutNegativeCaching() {
        AtomicInteger introspectCalls = new AtomicInteger();
        String token = accessToken(2201L, "transport", 60_000L);
        JwtAuthGlobalFilter filter = newFilter(request -> {
            introspectCalls.incrementAndGet();
            return Mono.just(ClientResponse.create(HttpStatus.FORBIDDEN).build());
        });

        MockServerWebExchange firstExchange = exchangeWithToken(token);
        filter.filter(firstExchange, chain).block();
        MockServerWebExchange secondExchange = exchangeWithToken(token);
        filter.filter(secondExchange, chain).block();

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, firstExchange.getResponse().getStatusCode());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, secondExchange.getResponse().getStatusCode());
        assertEquals(2, introspectCalls.get());
    }

    @Test
    void filterShouldInjectAuthHeadersFromRemoteIntrospection() {
        AtomicInteger introspectCalls = new AtomicInteger();
        List<String> calledPaths = new ArrayList<>();
        AtomicReference<ClientRequest> introspectRequest = new AtomicReference<>();
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        String token = accessToken(2301L, "neo", 60_000L);
        JwtAuthGlobalFilter filter = newFilter(request -> {
            String path = request.url().getPath();
            calledPaths.add(path);
            if ("/api/auth/internal/introspect".equals(path)) {
                introspectCalls.incrementAndGet();
                introspectRequest.set(request);
                return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(introspect(2301L, "neo", 60_000L))));
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
                        .header("X-Gateway-Route", "true")
                        .header("X-Internal-Secret", "forged-secret")
                        .build()
        );
        filter.filter(firstExchange, chain).block();
        MockServerWebExchange secondExchange = exchangeWithToken(token);
        filter.filter(secondExchange, chain).block();

        assertNotNull(introspectRequest.get());
        assertNotNull(forwardedExchange.get());
        assertEquals(HttpMethod.POST, introspectRequest.get().method());
        assertEquals("/api/auth/internal/introspect", introspectRequest.get().url().getPath());
        assertEquals(2, introspectCalls.get());
        assertFalse(calledPaths.contains("/api/auth/refresh"));
        assertEquals("internal-value", header(introspectRequest.get(), "X-Internal-Secret"));
        assertNotNull(header(introspectRequest.get(), INTERNAL_TIMESTAMP_HEADER));
        assertNotNull(header(introspectRequest.get(), INTERNAL_NONCE_HEADER));
        assertNotNull(header(introspectRequest.get(), INTERNAL_SIGNATURE_HEADER));
        assertTrue(AuthHeaderUtil.verifyHmacSha256(
                "internal-value",
                AuthHeaderUtil.buildInternalSignedFields(
                        "POST",
                        "/api/auth/internal/introspect",
                        AuthHeaderUtil.sha256Base64Url(token.getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                        header(introspectRequest.get(), INTERNAL_TIMESTAMP_HEADER),
                        header(introspectRequest.get(), INTERNAL_NONCE_HEADER)
                ),
                header(introspectRequest.get(), INTERNAL_SIGNATURE_HEADER)
        ));

        ServerHttpRequest request = forwardedExchange.get().getRequest();
        assertEquals("2301", request.getHeaders().getFirst("X-User-Id"));
        assertEquals("neo", request.getHeaders().getFirst("X-Username"));
        assertEquals("internal-value", request.getHeaders().getFirst("X-Internal-Secret"));
        assertFalse("forged-secret".equals(request.getHeaders().getFirst("X-Internal-Secret")));
        assertTrue(request.getHeaders().containsKey("X-Auth-User"));
        assertTrue(request.getHeaders().containsKey("X-Auth-Perms"));
        assertTrue(request.getHeaders().containsKey("X-Auth-Data"));
        assertTrue(request.getHeaders().containsKey("X-Auth-Ts"));
        assertTrue(request.getHeaders().containsKey("X-Auth-Nonce"));
        assertTrue(request.getHeaders().containsKey("X-Auth-Sign"));
    }

    @Test
    void filterShouldNotCachePartialFailureWhenIntrospectionFails() {
        AtomicInteger introspectCalls = new AtomicInteger();
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        String token = accessToken(2401L, "switch", 60_000L);
        JwtAuthGlobalFilter filter = newFilter(request -> {
            String path = request.url().getPath();
            if ("/api/auth/internal/introspect".equals(path)) {
                if (introspectCalls.incrementAndGet() == 1) {
                    return Mono.just(ClientResponse.create(HttpStatus.INTERNAL_SERVER_ERROR).build());
                }
                return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(introspect(2401L, "switch", 60_000L))));
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
        assertEquals(2, introspectCalls.get());
        assertNotNull(forwardedExchange.get());
        assertEquals("2401", forwardedExchange.get().getRequest().getHeaders().getFirst("X-User-Id"));
    }

    @Test
    void filterShouldAcceptTokenFromCookie() {
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        JwtAuthGlobalFilter filter = newFilter(request -> successResponseForPath(request, 2501L, "cookie"));
        when(chain.filter(any(ServerWebExchange.class))).thenAnswer(invocation -> {
            forwardedExchange.set(invocation.getArgument(0));
            return Mono.empty();
        });

        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .header("X-Gateway-Route", "true")
                        .cookie(new HttpCookie("IM_ACCESS_TOKEN", accessToken(2501L, "cookie", 60_000L)))
                        .build()
        );

        filter.filter(exchange, chain).block();

        assertNotNull(forwardedExchange.get());
        assertEquals("2501", forwardedExchange.get().getRequest().getHeaders().getFirst("X-User-Id"));
    }

    @Test
    void filterShouldUseWsIntrospectAndCacheForWebSocketPath() {
        AtomicInteger introspectCalls = new AtomicInteger();
        AtomicReference<ClientRequest> introspectRequest = new AtomicReference<>();
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        String token = accessToken(2701L, "ws-user", 60_000L);
        JwtAuthGlobalFilter filter = newFilter(request -> {
            String path = request.url().getPath();
            if ("/api/auth/internal/ws-introspect".equals(path)) {
                introspectCalls.incrementAndGet();
                introspectRequest.set(request);
                return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(introspect(2701L, "ws-user", 60_000L))));
            }
            return Mono.error(new AssertionError("unexpected path: " + path));
        });
        when(chain.filter(any(ServerWebExchange.class))).thenAnswer(invocation -> {
            forwardedExchange.set(invocation.getArgument(0));
            return Mono.empty();
        });

        MockServerWebExchange firstExchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/websocket/2701")
                        .header("Authorization", "Bearer " + token)
                        .build()
        );
        filter.filter(firstExchange, chain).block();
        MockServerWebExchange secondExchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/websocket/2701")
                        .header("Authorization", "Bearer " + token)
                        .build()
        );
        filter.filter(secondExchange, chain).block();

        assertNotNull(introspectRequest.get());
        assertEquals(HttpMethod.POST, introspectRequest.get().method());
        assertEquals("/api/auth/internal/ws-introspect", introspectRequest.get().url().getPath());
        assertEquals("internal-value", header(introspectRequest.get(), "X-Internal-Secret"));
        assertEquals(1, introspectCalls.get());
        assertNotNull(forwardedExchange.get());
        assertEquals("2701", forwardedExchange.get().getRequest().getHeaders().getFirst("X-User-Id"));
        assertEquals("ws-user", forwardedExchange.get().getRequest().getHeaders().getFirst("X-Username"));
        assertTrue(forwardedExchange.get().getRequest().getHeaders().containsKey("X-Auth-Sign"));
    }

    @Test
    void filterShouldUseRemoteIntrospectForHttp() {
        AtomicInteger introspectCalls = new AtomicInteger();
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        String token = accessToken(2801L, "remote-user", 60_000L);
        JwtAuthGlobalFilter filter = newFilter(request -> {
            String path = request.url().getPath();
            if ("/api/auth/internal/introspect".equals(path)) {
                introspectCalls.incrementAndGet();
                return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(introspect(2801L, "remote-user", 60_000L))));
            }
            return Mono.error(new AssertionError("unexpected path: " + path));
        });
        when(chain.filter(any(ServerWebExchange.class))).thenAnswer(invocation -> {
            forwardedExchange.set(invocation.getArgument(0));
            return Mono.empty();
        });

        filter.filter(exchangeWithToken(token), chain).block();

        assertEquals(1, introspectCalls.get());
        assertNotNull(forwardedExchange.get());
        assertEquals("2801", forwardedExchange.get().getRequest().getHeaders().getFirst("X-User-Id"));
        assertEquals("remote-user", forwardedExchange.get().getRequest().getHeaders().getFirst("X-Username"));
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
                        .header("X-Gateway-Route", "true")
                        .build()
        );
    }

    private Mono<ClientResponse> successResponseForPath(ClientRequest request, Long userId, String username) {
        String path = request.url().getPath();
        if ("/api/auth/internal/introspect".equals(path)) {
            return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(introspect(userId, username, 60_000L))));
        }
        return Mono.error(new AssertionError("unexpected path: " + path));
    }

    private String header(ClientRequest request, String name) {
        List<String> values = request.headers().get(name);
        return values == null || values.isEmpty() ? null : values.getFirst();
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
                .signWith(getSecretKey(ACCESS_SECRET), SignatureAlgorithm.HS512)
                .compact();
    }

    private String accessTokenMissingJti(Long userId, String username) {
        Date now = new Date();
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", userId);
        claims.put("username", username);
        claims.put("typ", "access");
        return Jwts.builder()
                .setClaims(claims)
                .setSubject(username)
                .setIssuedAt(now)
                .setExpiration(new Date(now.getTime() + 60_000L))
                .signWith(getSecretKey(ACCESS_SECRET), SignatureAlgorithm.HS512)
                .compact();
    }

    private AuthIntrospectResultDTO introspect(Long userId, String username, long expirationDeltaMs) {
        AuthIntrospectResultDTO dto = new AuthIntrospectResultDTO();
        dto.setValid(true);
        dto.setExpired(false);
        dto.setUserId(userId);
        dto.setUsername(username);
        dto.setExpiresAtEpochMs(System.currentTimeMillis() + expirationDeltaMs);
        dto.setUserInfo(Map.of("nickname", username));
        dto.setResourcePermissions(List.of("message:read"));
        dto.setDataScopes(Map.of("tenantId", 1));
        return dto;
    }

    private Map<String, Object> responseBody(MockServerWebExchange exchange) throws Exception {
        String json = exchange.getResponse().getBodyAsString().block();
        assertNotNull(json);
        return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
        });
    }

}
