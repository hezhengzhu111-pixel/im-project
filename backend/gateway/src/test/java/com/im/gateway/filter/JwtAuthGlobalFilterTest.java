package com.im.gateway.filter;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.config.GlobalRateLimitSwitch;
import com.im.config.RateLimitGlobalProperties;
import com.im.dto.ApiResponse;
import com.im.dto.AuthUserResourceDTO;
import com.im.util.AuthHeaderUtil;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
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
    private static final String OTHER_SECRET = "another-access-secret-another-access-secret-another-access-secret";

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
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/message/list").build());

        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        verify(chain, never()).filter(any(ServerWebExchange.class));
    }

    @Test
    void filterShouldRejectExpiredTokenLocallyWithoutCallingAuthService() throws Exception {
        List<String> calledPaths = new ArrayList<>();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            calledPaths.add(request.url().getPath());
            return Mono.error(new AssertionError("auth service should not be called for expired token"));
        });
        SimpleMeterRegistry meterRegistry = (SimpleMeterRegistry) ReflectionTestUtils.getField(filter, "meterRegistry");

        MockServerWebExchange exchange = exchangeWithToken(accessToken(2002L, "expired", -1_000L));
        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        Map<String, Object> body = responseBody(exchange);
        assertEquals(40101, body.get("code"));
        assertEquals("TOKEN_EXPIRED", body.get("message"));
        assertTrue(calledPaths.isEmpty());
        verify(chain, never()).filter(any(ServerWebExchange.class));
        assertEquals(1.0, meterRegistry.counter("gateway_auth_local_validation", "result", "expired").count());
    }

    @Test
    void filterShouldRejectInvalidTokenLocallyWithoutCallingAuthService() throws Exception {
        List<String> calledPaths = new ArrayList<>();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            calledPaths.add(request.url().getPath());
            return Mono.error(new AssertionError("auth service should not be called for invalid token"));
        });
        SimpleMeterRegistry meterRegistry = (SimpleMeterRegistry) ReflectionTestUtils.getField(filter, "meterRegistry");

        MockServerWebExchange exchange = exchangeWithToken(accessToken(2003L, "invalid", 60_000L) + "tampered");
        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        Map<String, Object> body = responseBody(exchange);
        assertEquals(40102, body.get("code"));
        assertEquals("TOKEN_INVALID", body.get("message"));
        assertTrue(calledPaths.isEmpty());
        verify(chain, never()).filter(any(ServerWebExchange.class));
        assertEquals(1.0, meterRegistry.counter("gateway_auth_local_validation", "result", "invalid").count());
    }

    @Test
    void filterShouldRejectTokenMissingRequiredClaimsLocally() throws Exception {
        List<String> calledPaths = new ArrayList<>();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            calledPaths.add(request.url().getPath());
            return Mono.error(new AssertionError("auth service should not be called for missing claims"));
        });

        MockServerWebExchange exchange = exchangeWithToken(accessTokenMissingJti(2004L, "missing"));
        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        Map<String, Object> body = responseBody(exchange);
        assertEquals(40102, body.get("code"));
        assertEquals("TOKEN_INVALID", body.get("message"));
        assertTrue(calledPaths.isEmpty());
    }

    @Test
    void filterShouldMapUserResourceTimeoutTo504() {
        AtomicInteger resourceCalls = new AtomicInteger();
        String token = accessToken(2101L, "timeout", 60_000L);
        JwtAuthGlobalFilter filter = newFilter(
                request -> {
                    resourceCalls.incrementAndGet();
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
        assertEquals(2, resourceCalls.get());
    }

    @Test
    void filterShouldMapUserResourceTransportFailuresTo503WithoutNegativeCaching() {
        AtomicInteger resourceCalls = new AtomicInteger();
        String token = accessToken(2201L, "transport", 60_000L);
        JwtAuthGlobalFilter filter = newFilter(request -> {
            resourceCalls.incrementAndGet();
            return Mono.just(ClientResponse.create(HttpStatus.FORBIDDEN).build());
        });

        MockServerWebExchange firstExchange = exchangeWithToken(token);
        filter.filter(firstExchange, chain).block();
        MockServerWebExchange secondExchange = exchangeWithToken(token);
        filter.filter(secondExchange, chain).block();

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, firstExchange.getResponse().getStatusCode());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, secondExchange.getResponse().getStatusCode());
        assertEquals(2, resourceCalls.get());
    }

    @Test
    void filterShouldInjectAuthHeadersAndCacheSuccessfulUserResourceLookup() {
        AtomicInteger resourceCalls = new AtomicInteger();
        List<String> calledPaths = new ArrayList<>();
        AtomicReference<ClientRequest> resourceRequest = new AtomicReference<>();
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        String token = accessToken(2301L, "neo", 60_000L);
        JwtAuthGlobalFilter filter = newFilter(request -> {
            String path = request.url().getPath();
            calledPaths.add(path);
            if ("/api/auth/internal/user-resource/2301".equals(path)) {
                resourceCalls.incrementAndGet();
                resourceRequest.set(request);
                return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(userResource(2301L, "neo"))));
            }
            return Mono.error(new AssertionError("unexpected path: " + path));
        });
        SimpleMeterRegistry meterRegistry = (SimpleMeterRegistry) ReflectionTestUtils.getField(filter, "meterRegistry");
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

        assertNotNull(resourceRequest.get());
        assertNotNull(forwardedExchange.get());
        assertEquals(HttpMethod.GET, resourceRequest.get().method());
        assertEquals("/api/auth/internal/user-resource/2301", resourceRequest.get().url().getPath());
        assertEquals(1, resourceCalls.get());
        assertFalse(calledPaths.contains("/api/auth/internal/validate-token"));
        assertFalse(calledPaths.contains("/api/auth/refresh"));
        assertEquals("internal-value", header(resourceRequest.get(), "X-Internal-Secret"));
        assertNotNull(header(resourceRequest.get(), INTERNAL_TIMESTAMP_HEADER));
        assertNotNull(header(resourceRequest.get(), INTERNAL_NONCE_HEADER));
        assertNotNull(header(resourceRequest.get(), INTERNAL_SIGNATURE_HEADER));
        assertTrue(AuthHeaderUtil.verifyHmacSha256(
                "internal-value",
                AuthHeaderUtil.buildInternalSignedFields(
                        "GET",
                        "/api/auth/internal/user-resource/2301",
                        AuthHeaderUtil.sha256Base64Url(null),
                        header(resourceRequest.get(), INTERNAL_TIMESTAMP_HEADER),
                        header(resourceRequest.get(), INTERNAL_NONCE_HEADER)
                ),
                header(resourceRequest.get(), INTERNAL_SIGNATURE_HEADER)
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
        assertEquals(2.0, meterRegistry.counter("gateway_auth_local_validation", "result", "valid").count());
    }

    @Test
    void filterShouldNotCachePartialFailureWhenUserResourceLoadFails() {
        AtomicInteger resourceCalls = new AtomicInteger();
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        String token = accessToken(2401L, "switch", 60_000L);
        JwtAuthGlobalFilter filter = newFilter(request -> {
            String path = request.url().getPath();
            if ("/api/auth/internal/user-resource/2401".equals(path)) {
                if (resourceCalls.incrementAndGet() == 1) {
                    return Mono.just(ClientResponse.create(HttpStatus.INTERNAL_SERVER_ERROR).build());
                }
                return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(userResource(2401L, "switch"))));
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
        assertEquals(2, resourceCalls.get());
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
                        .cookie(new HttpCookie("IM_ACCESS_TOKEN", accessToken(2501L, "cookie", 60_000L)))
                        .build()
        );

        filter.filter(exchange, chain).block();

        assertNotNull(forwardedExchange.get());
        assertEquals("2501", forwardedExchange.get().getRequest().getHeaders().getFirst("X-User-Id"));
    }

    @Test
    void filterShouldMaskRawTokenInFailureLogs() {
        JwtAuthGlobalFilter filter = newFilter(request -> Mono.error(new AssertionError("auth service should not be called")));
        ListAppender<ILoggingEvent> appender = attachListAppender();
        String rawToken = accessToken(2601L, "masked", 60_000L) + "tampered";

        try {
            MockServerWebExchange exchange = exchangeWithToken(rawToken);
            filter.filter(exchange, chain).block();

            String logs = joinedMessages(appender);
            assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
            assertFalse(logs.contains(rawToken));
            assertTrue(logs.contains("tokenSummary=sha256:"));
            assertTrue(logs.contains("status=INVALID_SIGNATURE_OR_MALFORMED"));
        } finally {
            detachListAppender(appender);
        }
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
        ReflectionTestUtils.setField(filter, "accessSecret", ACCESS_SECRET);
        ReflectionTestUtils.setField(filter, "meterRegistry", new SimpleMeterRegistry());
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
        if (("/api/auth/internal/user-resource/" + userId).equals(path)) {
            return Mono.just(jsonResponse(HttpStatus.OK, ApiResponse.success(userResource(userId, username))));
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

    private AuthUserResourceDTO userResource(Long userId, String username) {
        AuthUserResourceDTO dto = new AuthUserResourceDTO();
        dto.setUserId(userId);
        dto.setUsername(username);
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

    private ListAppender<ILoggingEvent> attachListAppender() {
        Logger logger = (Logger) LoggerFactory.getLogger(JwtAuthGlobalFilter.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        return appender;
    }

    private void detachListAppender(ListAppender<ILoggingEvent> appender) {
        Logger logger = (Logger) LoggerFactory.getLogger(JwtAuthGlobalFilter.class);
        logger.detachAppender(appender);
    }

    private String joinedMessages(ListAppender<ILoggingEvent> appender) {
        StringBuilder builder = new StringBuilder();
        for (ILoggingEvent event : appender.list) {
            builder.append(event.getFormattedMessage()).append('\n');
        }
        return builder.toString();
    }
}
