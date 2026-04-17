package com.im.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.config.GlobalRateLimitSwitch;
import com.im.config.RateLimitGlobalProperties;
import com.im.controller.AuthController;
import com.im.dto.ApiResponse;
import com.im.dto.AuthUserResourceDTO;
import com.im.dto.JwtLocalValidationResult;
import com.im.dto.TokenPairDTO;
import com.im.service.AuthTokenService;
import com.im.service.AuthUserResourceService;
import com.im.util.JwtLocalTokenValidator;
import com.im.util.TokenParser;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.ClientRequest;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JwtAuthGlobalFilterRefreshFlowTest {

    private static final String ACCESS_SECRET = "im-access-secret-im-access-secret-im-access-secret-im-access-secret";
    private static final String REFRESH_SECRET = "im-refresh-secret-im-refresh-secret-im-refresh-secret-im-refresh-secret";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void expiredAccessTokenShouldRefreshThroughAuthServiceAndRetrySuccessfully() {
        AuthFlowFixture fixture = new AuthFlowFixture();
        TokenPairDTO initialPair = fixture.authTokenService.issueTokenPair(3001L, "switch-user");
        String expiredAccessToken = fixture.expiredAccessToken(3001L, "switch-user");

        MockServerWebExchange expiredExchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .header("Authorization", "Bearer " + expiredAccessToken)
                        .build()
        );
        fixture.gatewayFilter.filter(expiredExchange, exchange -> {
            throw new AssertionError("expired request should not reach downstream chain");
        }).block();

        assertEquals(HttpStatus.UNAUTHORIZED, expiredExchange.getResponse().getStatusCode());
        assertTrue(expiredExchange.getResponse().getBodyAsString().block().contains("TOKEN_EXPIRED"));
        assertFalse(fixture.calledPaths.contains("/api/auth/internal/validate-token"));
        assertFalse(fixture.calledPaths.contains("/api/auth/refresh"));

        MockHttpServletRequest refreshRequest = new MockHttpServletRequest();
        refreshRequest.setCookies(
                new jakarta.servlet.http.Cookie("IM_REFRESH_TOKEN", initialPair.getRefreshToken()),
                new jakarta.servlet.http.Cookie("IM_ACCESS_TOKEN", expiredAccessToken)
        );
        MockHttpServletResponse refreshResponse = new MockHttpServletResponse();
        ApiResponse<TokenPairDTO> refreshResult = fixture.authController.refresh(null, refreshRequest, refreshResponse);

        assertEquals(200, refreshResult.getCode());
        assertNotNull(refreshResult.getData());
        assertNotNull(refreshResult.getData().getAccessToken());
        JwtLocalValidationResult validationResult = JwtLocalTokenValidator.validateAccessToken(
                refreshResult.getData().getAccessToken(),
                ACCESS_SECRET
        );
        assertTrue(validationResult.isValid());

        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();
        MockServerWebExchange retryExchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/list")
                        .header("Authorization", "Bearer " + refreshResult.getData().getAccessToken())
                        .build()
        );
        fixture.gatewayFilter.filter(retryExchange, exchange -> {
            forwardedExchange.set(exchange);
            return reactor.core.publisher.Mono.empty();
        }).block();

        assertNotNull(forwardedExchange.get());
        assertEquals("3001", forwardedExchange.get().getRequest().getHeaders().getFirst("X-User-Id"));
        assertEquals("switch-user", forwardedExchange.get().getRequest().getHeaders().getFirst("X-Username"));
        assertFalse(fixture.calledPaths.contains("/api/auth/internal/validate-token"));
    }

    private static final class AuthFlowFixture {
        private final List<String> calledPaths = new ArrayList<>();
        private final Map<String, String> redisValues = new ConcurrentHashMap<>();
        private final AuthTokenService authTokenService;
        private final AuthController authController;
        private final JwtAuthGlobalFilter gatewayFilter;

        private AuthFlowFixture() {
            StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
            @SuppressWarnings("unchecked")
            ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
            AuthUserResourceService authUserResourceService = mock(AuthUserResourceService.class);
            TokenParser tokenParser = new TokenParser();
            ReflectionTestUtils.setField(tokenParser, "accessSecret", ACCESS_SECRET);
            ReflectionTestUtils.setField(tokenParser, "refreshSecret", REFRESH_SECRET);

            when(redisTemplate.opsForValue()).thenReturn(valueOperations);
            when(authUserResourceService.getOrLoad(anyLong())).thenAnswer(invocation -> {
                Long userId = invocation.getArgument(0);
                AuthUserResourceDTO dto = new AuthUserResourceDTO();
                dto.setUserId(userId);
                dto.setUsername("switch-user");
                dto.setUserInfo(Map.of("nickname", "switch-user"));
                dto.setResourcePermissions(List.of("message:read"));
                dto.setDataScopes(Map.of("tenantId", 1));
                return dto;
            });
            org.mockito.Mockito.doAnswer(invocation -> {
                redisValues.put(invocation.getArgument(0), invocation.getArgument(1));
                return null;
            }).when(valueOperations).set(org.mockito.ArgumentMatchers.anyString(),
                    org.mockito.ArgumentMatchers.anyString(),
                    org.mockito.ArgumentMatchers.any(Duration.class));
            when(valueOperations.get(org.mockito.ArgumentMatchers.anyString()))
                    .thenAnswer(invocation -> redisValues.get(invocation.getArgument(0)));
            when(valueOperations.setIfAbsent(org.mockito.ArgumentMatchers.anyString(),
                    org.mockito.ArgumentMatchers.anyString(),
                    org.mockito.ArgumentMatchers.any(Duration.class)))
                    .thenAnswer(invocation -> redisValues.putIfAbsent(invocation.getArgument(0), invocation.getArgument(1)) == null);
            when(redisTemplate.execute(
                    org.mockito.ArgumentMatchers.any(),
                    org.mockito.ArgumentMatchers.anyList(),
                    org.mockito.ArgumentMatchers.anyString(),
                    org.mockito.ArgumentMatchers.anyString(),
                    org.mockito.ArgumentMatchers.anyString(),
                    org.mockito.ArgumentMatchers.anyString()
            )).thenAnswer(invocation -> {
                @SuppressWarnings("unchecked")
                List<String> keys = invocation.getArgument(1);
                redisValues.put(keys.get(0), invocation.getArgument(2));
                redisValues.put(keys.get(1), invocation.getArgument(4));
                return 1L;
            });
            when(redisTemplate.execute(
                    org.mockito.ArgumentMatchers.any(),
                    org.mockito.ArgumentMatchers.anyList(),
                    org.mockito.ArgumentMatchers.anyString()
            )).thenAnswer(invocation -> {
                @SuppressWarnings("unchecked")
                List<String> keys = invocation.getArgument(1);
                String key = keys.get(0);
                String expectedOwner = invocation.getArgument(2);
                if (expectedOwner.equals(redisValues.get(key))) {
                    redisValues.remove(key);
                    return 1L;
                }
                return 0L;
            });

            this.authTokenService = new AuthTokenService(redisTemplate, authUserResourceService, tokenParser);
            ReflectionTestUtils.setField(authTokenService, "accessSecret", ACCESS_SECRET);
            ReflectionTestUtils.setField(authTokenService, "refreshSecret", REFRESH_SECRET);
            ReflectionTestUtils.setField(authTokenService, "accessExpirationMs", 60_000L);
            ReflectionTestUtils.setField(authTokenService, "refreshExpirationMs", 120_000L);
            ReflectionTestUtils.setField(authTokenService, "previousRefreshGraceSeconds", 5L);
            ReflectionTestUtils.setField(authTokenService, "refreshLockSeconds", 5L);

            this.authController = new AuthController(authTokenService);
            ReflectionTestUtils.setField(authController, "accessTokenCookieName", "IM_ACCESS_TOKEN");
            ReflectionTestUtils.setField(authController, "refreshTokenCookieName", "IM_REFRESH_TOKEN");
            ReflectionTestUtils.setField(authController, "authCookieSameSite", "Lax");
            ReflectionTestUtils.setField(authController, "authCookieSecure", "never");
            ReflectionTestUtils.setField(authController, "wsTicketCookieName", "IM_WS_TICKET");
            ReflectionTestUtils.setField(authController, "wsTicketCookiePath", "/websocket");
            ReflectionTestUtils.setField(authController, "wsTicketCookieSameSite", "Strict");
            ReflectionTestUtils.setField(authController, "wsTicketCookieSecure", "never");

            ExchangeFunction exchangeFunction = this::exchange;
            MockEnvironment environment = new MockEnvironment();
            environment.setProperty(RateLimitGlobalProperties.ENABLED_KEY, "true");
            GlobalRateLimitSwitch switchConfig = new GlobalRateLimitSwitch(environment, new RateLimitGlobalProperties());
            switchConfig.refreshFromEnvironment();
            this.gatewayFilter = new JwtAuthGlobalFilter(objectMapper(), switchConfig, "http://im-auth-service", 200, exchangeFunction);
            ReflectionTestUtils.setField(gatewayFilter, "internalHeaderName", "X-Internal-Secret");
            ReflectionTestUtils.setField(gatewayFilter, "internalSecret", "internal-value");
            ReflectionTestUtils.setField(gatewayFilter, "gatewayAuthSecret", "gateway-secret");
            ReflectionTestUtils.setField(gatewayFilter, "jwtHeader", "Authorization");
            ReflectionTestUtils.setField(gatewayFilter, "jwtPrefix", "Bearer ");
            ReflectionTestUtils.setField(gatewayFilter, "accessTokenCookieName", "IM_ACCESS_TOKEN");
            ReflectionTestUtils.setField(gatewayFilter, "refreshTokenCookieName", "IM_REFRESH_TOKEN");
            ReflectionTestUtils.setField(gatewayFilter, "accessSecret", ACCESS_SECRET);
        }

        private Mono<ClientResponse> exchange(ClientRequest request) {
            String path = request.url().getPath();
            calledPaths.add(path);
            if ("/api/auth/internal/user-resource/3001".equals(path)) {
                AuthUserResourceDTO dto = new AuthUserResourceDTO();
                dto.setUserId(3001L);
                dto.setUsername("switch-user");
                dto.setUserInfo(Map.of("nickname", "switch-user"));
                dto.setResourcePermissions(List.of("message:read"));
                dto.setDataScopes(Map.of("tenantId", 1));
                try {
                    return Mono.just(ClientResponse.create(HttpStatus.OK)
                            .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                            .body(objectMapper().writeValueAsString(ApiResponse.success(dto)))
                            .build());
                } catch (Exception ex) {
                    throw new RuntimeException(ex);
                }
            }
            throw new AssertionError("unexpected auth-service path: " + path);
        }

        private String expiredAccessToken(Long userId, String username) {
            Date now = new Date();
            Map<String, Object> claims = new HashMap<>();
            claims.put("userId", userId);
            claims.put("username", username);
            claims.put("typ", "access");
            claims.put("jti", UUID.randomUUID().toString());
            return Jwts.builder()
                    .setClaims(claims)
                    .setSubject(username)
                    .setIssuedAt(new Date(now.getTime() - 5_000L))
                    .setExpiration(new Date(now.getTime() - 1_000L))
                    .signWith(JwtLocalTokenValidator.getSecretKey(ACCESS_SECRET), SignatureAlgorithm.HS512)
                    .compact();
        }

        private ObjectMapper objectMapper() {
            return new ObjectMapper();
        }
    }
}
