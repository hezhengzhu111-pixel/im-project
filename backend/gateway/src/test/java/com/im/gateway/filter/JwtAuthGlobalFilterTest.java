package com.im.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.AuthUserResourceDTO;
import com.im.dto.TokenParseResultDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.ReactiveValueOperations;
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

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JwtAuthGlobalFilterTest {

    @Mock
    private ReactiveStringRedisTemplate redisTemplate;
    @Mock
    private ReactiveValueOperations<String, String> valueOperations;
    @Mock
    private GatewayFilterChain chain;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        lenient().when(valueOperations.get(anyString())).thenReturn(Mono.empty());
        lenient().when(valueOperations.set(anyString(), anyString(), any(Duration.class))).thenReturn(Mono.just(true));
    }

    @Test
    void filterShouldBypassWhitelistPath() {
        JwtAuthGlobalFilter filter = newFilter(request -> Mono.error(new AssertionError("auth service should not be called")));
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/auth/refresh").build()
        );
        when(chain.filter(any(ServerWebExchange.class))).thenReturn(Mono.empty());

        filter.filter(exchange, chain).block();

        verify(chain).filter(any(ServerWebExchange.class));
    }

    @Test
    void filterShouldRejectInternalPathWithoutSecret() {
        JwtAuthGlobalFilter filter = newFilter(request -> Mono.error(new AssertionError("auth service should not be called")));
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/user/internal/profile").build()
        );

        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.FORBIDDEN, exchange.getResponse().getStatusCode());
        verify(chain, never()).filter(any(ServerWebExchange.class));
    }

    @Test
    void filterShouldRejectWhenTokenInvalid() {
        AtomicReference<ClientRequest> validateRequest = new AtomicReference<>();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            validateRequest.set(request);
            TokenParseResultDTO invalid = new TokenParseResultDTO();
            invalid.setValid(false);
            return Mono.just(jsonResponse(HttpStatus.OK, invalid));
        });
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/group/list")
                        .header("Authorization", "Bearer bad-token")
                        .build()
        );

        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        assertEquals(HttpMethod.POST, validateRequest.get().method());
        assertEquals("/api/auth/internal/validate-token", validateRequest.get().url().getPath());
        assertEquals("true", validateRequest.get().headers().getFirst("X-Check-Revoked"));
        verify(chain, never()).filter(any(ServerWebExchange.class));
    }

    @Test
    void filterShouldRejectWhenValidateEndpointReturnsNotFound() {
        AtomicReference<ClientRequest> validateRequest = new AtomicReference<>();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            validateRequest.set(request);
            return Mono.just(ClientResponse.create(HttpStatus.NOT_FOUND).build());
        });
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .header("Authorization", "Bearer missing-route")
                        .build()
        );

        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        assertEquals("/api/auth/internal/validate-token", validateRequest.get().url().getPath());
        verify(chain, never()).filter(any(ServerWebExchange.class));
    }

    @Test
    void filterShouldInjectAuthHeadersWhenTokenAndUserResourceAreValid() {
        AtomicReference<ClientRequest> validateRequest = new AtomicReference<>();
        AtomicReference<ClientRequest> resourceRequest = new AtomicReference<>();
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            String path = request.url().getPath();
            if ("/api/auth/internal/validate-token".equals(path)) {
                validateRequest.set(request);
                return Mono.just(jsonResponse(HttpStatus.OK, validToken(2001L, "neo")));
            }
            if ("/api/auth/internal/user-resource/2001".equals(path)) {
                resourceRequest.set(request);
                return Mono.just(jsonResponse(HttpStatus.OK, userResource(2001L)));
            }
            return Mono.error(new AssertionError("unexpected path: " + path));
        });
        when(chain.filter(any(ServerWebExchange.class))).thenAnswer(invocation -> {
            forwardedExchange.set(invocation.getArgument(0));
            return Mono.empty();
        });
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .header("Authorization", "Bearer ok-token")
                        .build()
        );

        filter.filter(exchange, chain).block();

        assertNotNull(validateRequest.get());
        assertNotNull(resourceRequest.get());
        assertNotNull(forwardedExchange.get());
        assertEquals(HttpMethod.POST, validateRequest.get().method());
        assertEquals("/api/auth/internal/user-resource/2001", resourceRequest.get().url().getPath());

        ServerHttpRequest request = forwardedExchange.get().getRequest();
        assertEquals("2001", request.getHeaders().getFirst("X-User-Id"));
        assertEquals("neo", request.getHeaders().getFirst("X-Username"));
        assertEquals("internal-value", request.getHeaders().getFirst("X-Internal-Secret"));
        assertTrue(request.getHeaders().containsKey("X-Auth-User"));
        assertTrue(request.getHeaders().containsKey("X-Auth-Perms"));
        assertTrue(request.getHeaders().containsKey("X-Auth-Data"));
        verify(valueOperations).set(eq("auth:user:2001"), anyString(), any(Duration.class));
    }

    @Test
    void filterShouldRejectWhenUserResourceFetchFails() {
        AtomicReference<ClientRequest> resourceRequest = new AtomicReference<>();
        JwtAuthGlobalFilter filter = newFilter(request -> {
            String path = request.url().getPath();
            if ("/api/auth/internal/validate-token".equals(path)) {
                return Mono.just(jsonResponse(HttpStatus.OK, validToken(3001L, "trinity")));
            }
            if ("/api/auth/internal/user-resource/3001".equals(path)) {
                resourceRequest.set(request);
                return Mono.just(ClientResponse.create(HttpStatus.INTERNAL_SERVER_ERROR).build());
            }
            return Mono.error(new AssertionError("unexpected path: " + path));
        });
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .header("Authorization", "Bearer ok-token")
                        .build()
        );

        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.UNAUTHORIZED, exchange.getResponse().getStatusCode());
        assertEquals("/api/auth/internal/user-resource/3001", resourceRequest.get().url().getPath());
        verify(chain, never()).filter(any(ServerWebExchange.class));
    }

    private JwtAuthGlobalFilter newFilter(ExchangeFunction exchangeFunction) {
        WebClient.Builder builder = WebClient.builder().exchangeFunction(exchangeFunction);
        JwtAuthGlobalFilter filter = new JwtAuthGlobalFilter(redisTemplate, objectMapper, builder, builder, "http://im-auth-service");
        ReflectionTestUtils.setField(filter, "internalHeaderName", "X-Internal-Secret");
        ReflectionTestUtils.setField(filter, "internalSecret", "internal-value");
        ReflectionTestUtils.setField(filter, "userResourceKeyPrefix", "auth:user:");
        ReflectionTestUtils.setField(filter, "cacheTtlSeconds", 60L);
        ReflectionTestUtils.setField(filter, "gatewayAuthSecret", "gateway-secret");
        ReflectionTestUtils.setField(filter, "tokenRevocationCheckEnabled", true);
        ReflectionTestUtils.setField(filter, "jwtHeader", "Authorization");
        ReflectionTestUtils.setField(filter, "jwtPrefix", "Bearer ");
        return filter;
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

    private TokenParseResultDTO validToken(Long userId, String username) {
        TokenParseResultDTO dto = new TokenParseResultDTO();
        dto.setValid(true);
        dto.setExpired(false);
        dto.setUserId(userId);
        dto.setUsername(username);
        return dto;
    }

    private AuthUserResourceDTO userResource(Long userId) {
        AuthUserResourceDTO dto = new AuthUserResourceDTO();
        dto.setUserId(userId);
        dto.setUsername("neo");
        dto.setUserInfo(Map.of("nickname", "Neo"));
        dto.setResourcePermissions(List.of("message:read"));
        dto.setDataScopes(Map.of("tenantId", 1));
        return dto;
    }
}
