package com.im.gateway.filter;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.AsyncCache;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.im.config.GlobalRateLimitSwitch;
import com.im.config.RateLimitGlobalProperties;
import com.im.dto.ApiResponse;
import com.im.dto.AuthUserResourceDTO;
import com.im.dto.TokenParseResultDTO;
import com.im.security.SecurityPaths;
import com.im.util.AuthHeaderUtil;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;

@Component
public class JwtAuthGlobalFilter implements GlobalFilter, Ordered {
    private static final String HEADER_USER_ID = "X-User-Id";
    private static final String HEADER_USERNAME = "X-Username";
    private static final String HEADER_AUTH_USER = "X-Auth-User";
    private static final String HEADER_AUTH_PERMS = "X-Auth-Perms";
    private static final String HEADER_AUTH_DATA = "X-Auth-Data";
    private static final String HEADER_AUTH_TS = "X-Auth-Ts";
    private static final String HEADER_AUTH_NONCE = "X-Auth-Nonce";
    private static final String HEADER_AUTH_SIGN = "X-Auth-Sign";
    private static final String HEADER_GATEWAY_ROUTE = "X-Gateway-Route";
    private static final String HEADER_RATE_LIMIT_GLOBAL_ENABLED = RateLimitGlobalProperties.SWITCH_HEADER;
    private static final int MAX_CACHE_SIZE = 10_000;
    private static final Duration INFLIGHT_CACHE_TTL = Duration.ofSeconds(30);
    private static final ParameterizedTypeReference<ApiResponse<TokenParseResultDTO>> TOKEN_RESPONSE_TYPE =
            new ParameterizedTypeReference<ApiResponse<TokenParseResultDTO>>() {
            };
    private static final ParameterizedTypeReference<ApiResponse<AuthUserResourceDTO>> USER_RESOURCE_RESPONSE_TYPE =
            new ParameterizedTypeReference<ApiResponse<AuthUserResourceDTO>>() {
            };

    private final ObjectMapper objectMapper;
    private final WebClient webClient;
    private final GlobalRateLimitSwitch globalRateLimitSwitch;
    private final Duration authServiceTimeout;
    private final Cache<String, TokenParseResultDTO> tokenCache;
    private final Cache<String, InvalidTokenMarker> invalidTokenCache;
    private final Cache<Long, AuthUserResourceDTO> userResourceCache;
    private final AsyncCache<String, TokenValidationOutcome> tokenValidationInflight;
    private final AsyncCache<Long, UserResourceLoadOutcome> userResourceInflight;

    @Value("${im.internal.header:X-Internal-Secret}")
    private String internalHeaderName;

    @Value("${im.internal.secret}")
    private String internalSecret;

    @Value("${im.gateway.auth.secret}")
    private String gatewayAuthSecret;

    @Value("${im.security.token-revocation-check.enabled:true}")
    private boolean tokenRevocationCheckEnabled;

    @Value("${jwt.header:Authorization}")
    private String jwtHeader;

    @Value("${jwt.prefix:Bearer }")
    private String jwtPrefix;

    @Value("${im.auth.cookie.access-token-name:IM_ACCESS_TOKEN}")
    private String accessTokenCookieName;

    @Value("${im.auth.cookie.refresh-token-name:IM_REFRESH_TOKEN}")
    private String refreshTokenCookieName;

    public JwtAuthGlobalFilter(ObjectMapper objectMapper,
                               @Qualifier("plainWebClientBuilder") WebClient.Builder plainWebClientBuilder,
                               @Qualifier("loadBalancedWebClientBuilder") WebClient.Builder loadBalancedWebClientBuilder,
                               GlobalRateLimitSwitch globalRateLimitSwitch,
                               @Value("${im.gateway.auth-service-url:http://127.0.0.1:8084}") String authServiceUrl,
                               @Value("${im.gateway.auth.request-timeout-ms:3000}") long requestTimeoutMs,
                               @Value("${im.gateway.auth.token-cache-ttl-seconds:10}") long tokenCacheTtlSeconds,
                               @Value("${im.gateway.auth.token-negative-cache-ttl-seconds:5}") long tokenNegativeCacheTtlSeconds,
                               @Value("${im.gateway.auth.user-resource-cache-ttl-seconds:15}") long userResourceCacheTtlSeconds) {
        this.objectMapper = objectMapper;
        this.globalRateLimitSwitch = globalRateLimitSwitch;
        this.webClient = (useLoadBalancedClient(authServiceUrl)
                ? loadBalancedWebClientBuilder
                : plainWebClientBuilder)
                .baseUrl(authServiceUrl)
                .build();
        this.authServiceTimeout = Duration.ofMillis(Math.max(1L, requestTimeoutMs));
        this.tokenCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(Math.max(1L, tokenCacheTtlSeconds)))
                .maximumSize(MAX_CACHE_SIZE)
                .build();
        this.invalidTokenCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(Math.max(1L, tokenNegativeCacheTtlSeconds)))
                .maximumSize(MAX_CACHE_SIZE)
                .build();
        this.userResourceCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(Math.max(1L, userResourceCacheTtlSeconds)))
                .maximumSize(MAX_CACHE_SIZE)
                .build();
        this.tokenValidationInflight = Caffeine.newBuilder()
                .expireAfterWrite(INFLIGHT_CACHE_TTL)
                .maximumSize(MAX_CACHE_SIZE)
                .buildAsync();
        this.userResourceInflight = Caffeine.newBuilder()
                .expireAfterWrite(INFLIGHT_CACHE_TTL)
                .maximumSize(MAX_CACHE_SIZE)
                .buildAsync();
    }

    private boolean useLoadBalancedClient(String authServiceUrl) {
        return authServiceUrl != null && authServiceUrl.trim().startsWith("lb://");
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerWebExchange sanitizedExchange = sanitizeIncomingExchange(exchange);
        ServerWebExchange switchAwareExchange = applyGlobalRateLimitHeader(sanitizedExchange);
        FilterInput input = filterInput(switchAwareExchange);
        InputStageResult inputStageResult = filterInputStage(input);
        Mono<Void> inputOutput = filterInputOutput(switchAwareExchange, chain, inputStageResult);
        if (inputOutput != null) {
            return inputOutput;
        }

        Mono<ServerWebExchange> authenticatedExchange = authenticateAndDecorate(switchAwareExchange, input.token())
                .onErrorResume(GatewayAuthException.class,
                        ex -> writeStatus(switchAwareExchange, ex.status()).then(Mono.empty()))
                .onErrorResume(Throwable.class,
                        ex -> writeStatus(switchAwareExchange, HttpStatus.SERVICE_UNAVAILABLE).then(Mono.empty()));

        return authenticatedExchange.flatMap(chain::filter);
    }

    private ServerWebExchange applyGlobalRateLimitHeader(ServerWebExchange exchange) {
        String switchValue = Boolean.toString(globalRateLimitSwitch.isEnabled());
        exchange.getResponse().getHeaders().set(HEADER_RATE_LIMIT_GLOBAL_ENABLED, switchValue);
        ServerHttpRequest request = exchange.getRequest().mutate()
                .headers(headers -> headers.set(HEADER_RATE_LIMIT_GLOBAL_ENABLED, switchValue))
                .build();
        return exchange.mutate().request(request).build();
    }

    private FilterInput filterInput(ServerWebExchange exchange) {
        String path = exchange.getRequest().getURI().getPath();
        String authHeader = exchange.getRequest().getHeaders().getFirst(jwtHeader);
        String token = extractToken(exchange, authHeader);
        boolean authCookiePresent = hasCookie(exchange, accessTokenCookieName) || hasCookie(exchange, refreshTokenCookieName);
        boolean gatewayRouteHeaderPresent = exchange.getRequest().getHeaders().getFirst(HEADER_GATEWAY_ROUTE) != null;
        String method = exchange.getRequest().getMethod() == null ? "" : exchange.getRequest().getMethod().name();
        return new FilterInput(path, token, authCookiePresent, gatewayRouteHeaderPresent, method);
    }

    private ServerWebExchange sanitizeIncomingExchange(ServerWebExchange exchange) {
        if (exchange.getRequest().getHeaders().getFirst(internalHeaderName) == null) {
            return exchange;
        }
        ServerHttpRequest sanitizedRequest = exchange.getRequest().mutate()
                .headers(headers -> headers.remove(internalHeaderName))
                .build();
        return exchange.mutate().request(sanitizedRequest).build();
    }

    private String extractToken(ServerWebExchange exchange, String authHeader) {
        String token = extractTokenFromHeader(authHeader);
        if (token != null && !token.isBlank()) {
            return token;
        }
        var cookie = exchange.getRequest().getCookies().getFirst(accessTokenCookieName);
        if (cookie == null) {
            return null;
        }
        String value = cookie.getValue();
        return value == null || value.isBlank() ? null : value.trim();
    }

    private InputStageResult filterInputStage(FilterInput input) {
        if (requiresCookieCsrfCheck(input)) {
            return InputStageResult.reject(HttpStatus.FORBIDDEN);
        }
        if (SecurityPaths.isGatewayWhiteList(input.path())) {
            return InputStageResult.passThrough();
        }
        if (SecurityPaths.isGatewayInternalPath(input.path())) {
            return InputStageResult.reject(HttpStatus.FORBIDDEN);
        }
        if (input.token() == null || input.token().trim().isEmpty()) {
            return InputStageResult.reject(HttpStatus.UNAUTHORIZED);
        }
        return null;
    }

    private boolean hasCookie(ServerWebExchange exchange, String name) {
        return name != null && exchange.getRequest().getCookies().getFirst(name) != null;
    }

    private boolean requiresCookieCsrfCheck(FilterInput input) {
        return input.authCookiePresent()
                && isUnsafeMethod(input.method())
                && !input.gatewayRouteHeaderPresent();
    }

    private boolean isUnsafeMethod(String method) {
        return "POST".equalsIgnoreCase(method)
                || "PUT".equalsIgnoreCase(method)
                || "PATCH".equalsIgnoreCase(method)
                || "DELETE".equalsIgnoreCase(method);
    }

    private Mono<Void> filterInputOutput(ServerWebExchange exchange, GatewayFilterChain chain, InputStageResult stageResult) {
        if (stageResult == null) {
            return null;
        }
        if (stageResult.shouldPassThrough()) {
            return chain.filter(exchange);
        }
        return writeStatus(exchange, stageResult.rejectStatus());
    }

    private Mono<ServerWebExchange> authenticateAndDecorate(ServerWebExchange exchange, String token) {
        return validateToken(token)
                .flatMap(this::buildAuthContext)
                .flatMap(context -> resolveUserResource(context.userId())
                        .map(userResource -> mutateExchange(exchange, context, userResource)));
    }

    private Mono<AuthContext> buildAuthContext(TokenParseResultDTO parseResult) {
        AuthContext context = validateAuthContext(parseResult);
        if (context == null) {
            return Mono.error(GatewayAuthException.serviceUnavailable("auth response missing user context"));
        }
        return Mono.just(context);
    }

    private ServerWebExchange mutateExchange(ServerWebExchange exchange,
                                             AuthContext context,
                                             AuthUserResourceDTO userResource) {
        SignedAuthHeaders signedHeaders = buildSignedAuthHeaders(context, userResource);
        ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                .headers(headers -> {
                    headers.remove(HEADER_USER_ID);
                    headers.remove(HEADER_USERNAME);
                    headers.remove(internalHeaderName);
                    headers.remove(HEADER_AUTH_USER);
                    headers.remove(HEADER_AUTH_PERMS);
                    headers.remove(HEADER_AUTH_DATA);
                    headers.remove(HEADER_AUTH_TS);
                    headers.remove(HEADER_AUTH_NONCE);
                    headers.remove(HEADER_AUTH_SIGN);
                    headers.remove(HEADER_RATE_LIMIT_GLOBAL_ENABLED);
                    headers.set(HEADER_USER_ID, String.valueOf(context.userId()));
                    headers.set(HEADER_USERNAME, context.username());
                    headers.set(internalHeaderName, internalSecret);
                    headers.set(HEADER_AUTH_USER, signedHeaders.userB64());
                    headers.set(HEADER_AUTH_PERMS, signedHeaders.permsB64());
                    headers.set(HEADER_AUTH_DATA, signedHeaders.dataB64());
                    headers.set(HEADER_AUTH_TS, signedHeaders.ts());
                    headers.set(HEADER_AUTH_NONCE, signedHeaders.nonce());
                    headers.set(HEADER_AUTH_SIGN, signedHeaders.signature());
                    headers.set(HEADER_RATE_LIMIT_GLOBAL_ENABLED, Boolean.toString(globalRateLimitSwitch.isEnabled()));
                })
                .build();
        return exchange.mutate().request(mutatedRequest).build();
    }

    private SignedAuthHeaders buildSignedAuthHeaders(AuthContext context, AuthUserResourceDTO userResource) {
        String userInfoJson = safeWriteJson(userResource.getUserInfo());
        String permsJson = safeWriteJson(userResource.getResourcePermissions());
        String dataJson = safeWriteJson(userResource.getDataScopes());
        String userB64 = AuthHeaderUtil.base64UrlEncode(userInfoJson);
        String permsB64 = AuthHeaderUtil.base64UrlEncode(permsJson);
        String dataB64 = AuthHeaderUtil.base64UrlEncode(dataJson);
        String ts = String.valueOf(System.currentTimeMillis());
        String nonce = UUID.randomUUID().toString();
        String signature = AuthHeaderUtil.signHmacSha256(
                gatewayAuthSecret,
                AuthHeaderUtil.buildSignedFields(
                        String.valueOf(context.userId()),
                        context.username(),
                        userB64,
                        permsB64,
                        dataB64,
                        ts,
                        nonce
                )
        );
        return new SignedAuthHeaders(userB64, permsB64, dataB64, ts, nonce, signature);
    }

    private Mono<TokenParseResultDTO> validateToken(String token) {
        String localFailureReason = inspectTokenPayload(token);
        if (localFailureReason != null) {
            cacheInvalidToken(token, localFailureReason);
            return Mono.error(GatewayAuthException.unauthorized(localFailureReason));
        }

        InvalidTokenMarker invalidMarker = invalidTokenCache.getIfPresent(token);
        if (invalidMarker != null) {
            return Mono.error(GatewayAuthException.unauthorized(invalidMarker.reason()));
        }

        TokenParseResultDTO cached = tokenCache.getIfPresent(token);
        if (isCacheableTokenResult(cached)) {
            return Mono.just(cached);
        }

        return Mono.fromFuture(tokenValidationInflight.get(token, (key, executor) -> buildValidateTokenOutcomeMono(key).toFuture()))
                .doOnNext(ignore -> tokenValidationInflight.synchronous().invalidate(token))
                .doOnError(ignore -> tokenValidationInflight.synchronous().invalidate(token))
                .onErrorMap(this::unwrapAsyncException)
                .flatMap(outcome -> applyTokenValidationOutcome(token, outcome));
    }

    private Mono<TokenValidationOutcome> buildValidateTokenOutcomeMono(String token) {
        return exchangeForApiResponse(webClient.post()
                        .uri("/api/auth/internal/validate-token")
                        .header(internalHeaderName, internalSecret)
                        .header("X-Check-Revoked", String.valueOf(tokenRevocationCheckEnabled))
                        .bodyValue(token), TOKEN_RESPONSE_TYPE)
                .map(response -> toTokenValidationOutcome(extractApiData(response)))
                .onErrorResume(GatewayAuthException.class,
                        ex -> Mono.just(TokenValidationOutcome.failure(ex.status(), ex.getMessage())));
    }

    private Mono<AuthUserResourceDTO> resolveUserResource(Long userId) {
        AuthUserResourceDTO cached = userResourceCache.getIfPresent(userId);
        if (isCacheableUserResource(cached, userId)) {
            return Mono.just(cached);
        }

        return Mono.fromFuture(userResourceInflight.get(userId, (key, executor) -> buildLoadUserResourceOutcomeMono(key).toFuture()))
                .doOnNext(ignore -> userResourceInflight.synchronous().invalidate(userId))
                .doOnError(ignore -> userResourceInflight.synchronous().invalidate(userId))
                .onErrorMap(this::unwrapAsyncException)
                .flatMap(this::applyUserResourceLoadOutcome);
    }

    private Mono<UserResourceLoadOutcome> buildLoadUserResourceOutcomeMono(Long userId) {
        return exchangeForApiResponse(webClient.get()
                        .uri(uriBuilder -> uriBuilder.path("/api/auth/internal/user-resource/{userId}").build(userId))
                        .header(internalHeaderName, internalSecret), USER_RESOURCE_RESPONSE_TYPE)
                .map(response -> toUserResourceLoadOutcome(userId, extractApiData(response)))
                .onErrorResume(GatewayAuthException.class,
                        ex -> Mono.just(UserResourceLoadOutcome.failure(ex.status(), ex.getMessage())));
    }

    private <T> Mono<ApiResponse<T>> exchangeForApiResponse(WebClient.RequestHeadersSpec<?> requestSpec,
                                                            ParameterizedTypeReference<ApiResponse<T>> responseType) {
        return requestSpec.exchangeToMono(response -> {
                    if (response.statusCode().is2xxSuccessful()) {
                        return response.bodyToMono(responseType)
                                .switchIfEmpty(Mono.error(GatewayAuthException.serviceUnavailable("auth service empty response")));
                    }
                    return response.releaseBody()
                            .then(Mono.error(GatewayAuthException.serviceUnavailable(
                                    "auth service transport error: " + response.statusCode().value())));
                })
                .timeout(authServiceTimeout)
                .onErrorMap(this::mapAuthServiceError);
    }

    private Throwable mapAuthServiceError(Throwable throwable) {
        Throwable unwrapped = unwrapAsyncException(throwable);
        if (unwrapped instanceof GatewayAuthException) {
            return unwrapped;
        }
        if (unwrapped instanceof TimeoutException) {
            return GatewayAuthException.gatewayTimeout("auth service timeout");
        }
        return GatewayAuthException.serviceUnavailable("auth service unavailable");
    }

    private Throwable unwrapAsyncException(Throwable throwable) {
        Throwable current = throwable;
        while ((current instanceof CompletionException || current instanceof ExecutionException) && current.getCause() != null) {
            current = current.getCause();
        }
        return current;
    }

    private void cacheValidToken(String token, TokenParseResultDTO result) {
        tokenCache.put(token, result);
        invalidTokenCache.invalidate(token);
    }

    private void cacheInvalidToken(String token, String reason) {
        tokenCache.invalidate(token);
        invalidTokenCache.put(token, new InvalidTokenMarker(reason == null ? "invalid token" : reason));
    }

    private TokenValidationOutcome toTokenValidationOutcome(TokenParseResultDTO result) {
        if (result == null) {
            return TokenValidationOutcome.failure(HttpStatus.SERVICE_UNAVAILABLE, "auth validate response missing body");
        }
        if (result.isExpired() || !result.isValid()) {
            return TokenValidationOutcome.invalid(result.getError());
        }
        if (validateAuthContext(result) == null) {
            return TokenValidationOutcome.failure(HttpStatus.SERVICE_UNAVAILABLE, "auth validate response missing subject");
        }
        return TokenValidationOutcome.valid(result);
    }

    private Mono<TokenParseResultDTO> applyTokenValidationOutcome(String token, TokenValidationOutcome outcome) {
        if (outcome.result() != null) {
            cacheValidToken(token, outcome.result());
            return Mono.just(outcome.result());
        }
        if (HttpStatus.UNAUTHORIZED.equals(outcome.status())) {
            cacheInvalidToken(token, outcome.message());
        }
        return Mono.error(new GatewayAuthException(outcome.status(), outcome.message()));
    }

    private UserResourceLoadOutcome toUserResourceLoadOutcome(Long userId, AuthUserResourceDTO dto) {
        if (!isCacheableUserResource(dto, userId)) {
            return UserResourceLoadOutcome.failure(HttpStatus.SERVICE_UNAVAILABLE, "auth user resource response invalid");
        }
        return UserResourceLoadOutcome.success(dto);
    }

    private Mono<AuthUserResourceDTO> applyUserResourceLoadOutcome(UserResourceLoadOutcome outcome) {
        if (outcome.result() != null) {
            userResourceCache.put(outcome.result().getUserId(), outcome.result());
            return Mono.just(outcome.result());
        }
        return Mono.error(new GatewayAuthException(outcome.status(), outcome.message()));
    }

    private String inspectTokenPayload(String token) {
        String[] segments = token.split("\\.", -1);
        if (segments.length != 3) {
            return "malformed jwt";
        }
        try {
            byte[] payloadBytes = Base64.getUrlDecoder().decode(segments[1]);
            JsonNode payload = objectMapper.readTree(new String(payloadBytes, StandardCharsets.UTF_8));
            if (payload == null || !payload.isObject()) {
                return "invalid jwt payload";
            }
            JsonNode expNode = payload.get("exp");
            if (expNode != null && expNode.canConvertToLong()) {
                long nowEpochSeconds = Instant.now().getEpochSecond();
                if (expNode.asLong() <= nowEpochSeconds) {
                    return "jwt expired";
                }
            }
            return null;
        } catch (IllegalArgumentException ex) {
            return "invalid jwt payload encoding";
        } catch (Exception ex) {
            return "invalid jwt payload";
        }
    }

    private String safeWriteJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return "null";
        }
    }

    private <T> T extractApiData(ApiResponse<T> response) {
        if (response == null || !Integer.valueOf(200).equals(response.getCode()) || response.getData() == null) {
            return null;
        }
        return response.getData();
    }

    private Mono<Void> writeStatus(ServerWebExchange exchange, HttpStatus status) {
        exchange.getResponse().setStatusCode(status);
        return exchange.getResponse().setComplete();
    }

    private AuthContext validateAuthContext(TokenParseResultDTO parseResult) {
        if (parseResult == null || !parseResult.isValid() || parseResult.isExpired()) {
            return null;
        }
        Long userId = parseResult.getUserId();
        String username = parseResult.getUsername();
        if (userId == null || username == null || username.isBlank()) {
            return null;
        }
        return new AuthContext(userId, username);
    }

    private boolean isCacheableTokenResult(TokenParseResultDTO result) {
        return validateAuthContext(result) != null;
    }

    private boolean isCacheableUserResource(AuthUserResourceDTO dto, Long expectedUserId) {
        return dto != null && dto.getUserId() != null && expectedUserId != null && expectedUserId.equals(dto.getUserId());
    }

    private String extractTokenFromHeader(String authHeader) {
        if (authHeader == null) {
            return null;
        }
        String normalized = authHeader.trim();
        if (normalized.startsWith(jwtPrefix)) {
            normalized = normalized.substring(jwtPrefix.length()).trim();
        }
        return normalized.isEmpty() ? null : normalized;
    }

    @Override
    public int getOrder() {
        return -100;
    }

    private record FilterInput(String path, String token, boolean authCookiePresent, boolean gatewayRouteHeaderPresent,
                               String method) {
    }

    private record AuthContext(Long userId, String username) {
    }

    private record InputStageResult(boolean shouldPassThrough, HttpStatus rejectStatus) {
        private static InputStageResult passThrough() {
            return new InputStageResult(true, null);
        }

        private static InputStageResult reject(HttpStatus status) {
            return new InputStageResult(false, status);
        }
    }

    private record SignedAuthHeaders(String userB64,
                                     String permsB64,
                                     String dataB64,
                                     String ts,
                                     String nonce,
                                     String signature) {
    }

    private record InvalidTokenMarker(String reason) {
    }

    private record TokenValidationOutcome(TokenParseResultDTO result, HttpStatus status, String message) {
        private static TokenValidationOutcome valid(TokenParseResultDTO result) {
            return new TokenValidationOutcome(result, null, null);
        }

        private static TokenValidationOutcome invalid(String message) {
            return new TokenValidationOutcome(null, HttpStatus.UNAUTHORIZED, message == null ? "invalid token" : message);
        }

        private static TokenValidationOutcome failure(HttpStatus status, String message) {
            return new TokenValidationOutcome(null, status, message);
        }
    }

    private record UserResourceLoadOutcome(AuthUserResourceDTO result, HttpStatus status, String message) {
        private static UserResourceLoadOutcome success(AuthUserResourceDTO result) {
            return new UserResourceLoadOutcome(result, null, null);
        }

        private static UserResourceLoadOutcome failure(HttpStatus status, String message) {
            return new UserResourceLoadOutcome(null, status, message);
        }
    }

    private static final class GatewayAuthException extends RuntimeException {
        private final HttpStatus status;

        private GatewayAuthException(HttpStatus status, String message) {
            super(message);
            this.status = status;
        }

        private HttpStatus status() {
            return status;
        }

        private static GatewayAuthException unauthorized(String message) {
            return new GatewayAuthException(HttpStatus.UNAUTHORIZED, message);
        }

        private static GatewayAuthException gatewayTimeout(String message) {
            return new GatewayAuthException(HttpStatus.GATEWAY_TIMEOUT, message);
        }

        private static GatewayAuthException serviceUnavailable(String message) {
            return new GatewayAuthException(HttpStatus.SERVICE_UNAVAILABLE, message);
        }
    }
}
