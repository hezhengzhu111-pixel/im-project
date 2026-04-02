package com.im.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
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
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.UUID;

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
    // FIX: 为 Auth 服务调用设置统一超时时间，避免无响应时拖垮网关线程。
    private static final Duration AUTH_SERVICE_TIMEOUT = Duration.ofSeconds(3);

    private final ReactiveStringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final WebClient webClient;
    
    // FIX: 仅缓存成功且可用的 token 校验结果，避免把空结果或异常路径缓存成大面积 401。
    private final Cache<String, TokenParseResultDTO> tokenCache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(10))
            .maximumSize(10000)
            .build();

    // FIX: 仅复用 in-flight 远程校验请求，结束后立即移除，避免失败结果长期驻留。
    private final Cache<String, Mono<TokenParseResultDTO>> tokenInflightCache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(10))
            .maximumSize(10000)
            .build();

    // FIX: 本地只缓存成功的用户资源结果，失败场景允许后续重新拉取。
    private final Cache<Long, AuthUserResourceDTO> resourceCache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(10))
            .maximumSize(10000)
            .build();

    // FIX: 仅复用同一 userId 的 in-flight 资源加载请求，完成后立即清理。
    private final Cache<Long, Mono<AuthUserResourceDTO>> resourceInflightCache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(10))
            .maximumSize(10000)
            .build();

    @Value("${im.internal.header:X-Internal-Secret}")
    private String internalHeaderName;

    @Value("${im.internal.secret}")
    private String internalSecret;

    @Value("${im.gateway.auth.user-resource-key-prefix:auth:user:}")
    private String userResourceKeyPrefix;

    @Value("${im.gateway.auth.cache-ttl-seconds:3600}")
    private long cacheTtlSeconds;

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

    public JwtAuthGlobalFilter(ReactiveStringRedisTemplate redisTemplate,
                               ObjectMapper objectMapper,
                               @Qualifier("plainWebClientBuilder") WebClient.Builder plainWebClientBuilder,
                               @Qualifier("loadBalancedWebClientBuilder") WebClient.Builder loadBalancedWebClientBuilder,
                               @Value("${im.gateway.auth-service-url:http://127.0.0.1:8084}") String authServiceUrl) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.webClient = (useLoadBalancedClient(authServiceUrl)
                ? loadBalancedWebClientBuilder
                : plainWebClientBuilder)
                .baseUrl(authServiceUrl)
                .build();
    }

    private boolean useLoadBalancedClient(String authServiceUrl) {
        if (authServiceUrl == null) {
            return false;
        }
        return authServiceUrl.trim().startsWith("lb://");
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerWebExchange sanitizedExchange = sanitizeIncomingExchange(exchange);
        FilterInput input = filterInput(sanitizedExchange);
        InputStageResult inputStageResult = filterInputStage(input);
        Mono<Void> inputOutput = filterInputOutput(sanitizedExchange, chain, inputStageResult);
        if (inputOutput != null) {
            return inputOutput;
        }
        return filterProcess(sanitizedExchange, chain, input)
                .onErrorResume(e -> {
                    sanitizedExchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                    return sanitizedExchange.getResponse().setComplete();
                });
    }

    private FilterInput filterInput(ServerWebExchange exchange) {
        String path = exchange.getRequest().getURI().getPath();
        String authHeader = exchange.getRequest().getHeaders().getFirst(jwtHeader);
        String token = extractToken(exchange, authHeader);
        return new FilterInput(path, token);
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

    private Mono<Void> filterInputOutput(ServerWebExchange exchange, GatewayFilterChain chain, InputStageResult stageResult) {
        if (stageResult == null) {
            return null;
        }
        if (stageResult.shouldPassThrough()) {
            return chain.filter(exchange);
        }
        exchange.getResponse().setStatusCode(stageResult.rejectStatus());
        return exchange.getResponse().setComplete();
    }

    private Mono<Void> filterProcess(ServerWebExchange exchange, GatewayFilterChain chain, FilterInput input) {
        return filterProcessInput(input)
                .flatMap(context -> filterProcessOutput(exchange, chain, context))
                .switchIfEmpty(Mono.defer(() -> unauthorized(exchange)));
    }

    private Mono<AuthContext> filterProcessInput(FilterInput input) {
        return validateToken(input.token())
                .flatMap(parseResult -> {
                    AuthContext context = validateAuthContext(parseResult);
                    if (context == null) {
                        return Mono.empty();
                    }
                    return Mono.just(context);
                });
    }

    private Mono<Void> filterProcessOutput(ServerWebExchange exchange, GatewayFilterChain chain, AuthContext context) {
        return resolveUserResource(context.userId())
                .flatMap(userResource -> filterOutput(exchange, chain, context, userResource))
                .switchIfEmpty(Mono.defer(() -> {
                    return unauthorized(exchange);
                }));
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange) {
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        return exchange.getResponse().setComplete();
    }

    private AuthContext validateAuthContext(TokenParseResultDTO parseResult) {
        if (parseResult == null || !parseResult.isValid() || parseResult.isExpired()) {
            return null;
        }
        Long userId = parseResult.getUserId();
        String username = parseResult.getUsername();
        if (userId == null || username == null) {
            return null;
        }
        return new AuthContext(userId, username);
    }

    private Mono<AuthUserResourceDTO> resolveUserResource(Long userId) {
        AuthUserResourceDTO localCached = resourceCache.getIfPresent(userId);
        if (isCacheableUserResource(localCached, userId)) {
            return Mono.just(localCached);
        }
        String cacheKey = userResourceKeyPrefix + userId;
        return redisTemplate.opsForValue().get(cacheKey)
                .flatMap(json -> {
                    AuthUserResourceDTO dto = tryParseUserResource(json);
                    if (!isCacheableUserResource(dto, userId)) {
                        return loadUserResourceFromAuthService(userId).flatMap(loaded -> cacheAndReturn(cacheKey, loaded));
                    }
                    resourceCache.put(userId, dto);
                    return Mono.just(dto);
                })
                .switchIfEmpty(loadUserResourceFromAuthService(userId).flatMap(loaded -> cacheAndReturn(cacheKey, loaded)));
    }

    private Mono<Void> filterOutput(ServerWebExchange exchange,
                                    GatewayFilterChain chain,
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
                    headers.set(HEADER_USER_ID, String.valueOf(context.userId()));
                    headers.set(HEADER_USERNAME, context.username());
                    headers.set(internalHeaderName, internalSecret);
                    headers.set(HEADER_AUTH_USER, signedHeaders.userB64());
                    headers.set(HEADER_AUTH_PERMS, signedHeaders.permsB64());
                    headers.set(HEADER_AUTH_DATA, signedHeaders.dataB64());
                    headers.set(HEADER_AUTH_TS, signedHeaders.ts());
                    headers.set(HEADER_AUTH_NONCE, signedHeaders.nonce());
                    headers.set(HEADER_AUTH_SIGN, signedHeaders.signature());
                })
                .build();
        return chain.filter(exchange.mutate().request(mutatedRequest).build());
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
        TokenParseResultDTO cached = tokenCache.getIfPresent(token);
        if (isCacheableTokenResult(cached)) {
            return Mono.just(cached);
        }
        return tokenInflightCache.asMap().computeIfAbsent(token, key -> buildValidateTokenMono(key)
                .doOnNext(result -> {
                    if (isCacheableTokenResult(result)) {
                        tokenCache.put(key, result);
                    }
                })
                .doFinally(signalType -> tokenInflightCache.invalidate(key))
                .cache());
    }

    private Mono<TokenParseResultDTO> buildValidateTokenMono(String token) {
        return webClient.post()
                .uri("/api/auth/internal/validate-token")
                .header(internalHeaderName, internalSecret)
                .header("X-Check-Revoked", String.valueOf(tokenRevocationCheckEnabled))
                .bodyValue(token)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<ApiResponse<TokenParseResultDTO>>() {})
                .timeout(AUTH_SERVICE_TIMEOUT)
                .flatMap(this::extractApiData);
    }

    private AuthUserResourceDTO tryParseUserResource(String json) {
        if (json == null || json.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.readValue(json, AuthUserResourceDTO.class);
        } catch (Exception e) {
            return null;
        }
    }

    private Mono<AuthUserResourceDTO> loadUserResourceFromAuthService(Long userId) {
        AuthUserResourceDTO cached = resourceCache.getIfPresent(userId);
        if (isCacheableUserResource(cached, userId)) {
            return Mono.just(cached);
        }
        return resourceInflightCache.asMap().computeIfAbsent(userId, key -> buildLoadUserResourceMono(key)
                .doOnNext(dto -> {
                    if (isCacheableUserResource(dto, key)) {
                        resourceCache.put(key, dto);
                    }
                })
                .doFinally(signalType -> resourceInflightCache.invalidate(key))
                .cache());
    }

    private Mono<AuthUserResourceDTO> buildLoadUserResourceMono(Long userId) {
        return webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/api/auth/internal/user-resource/{userId}")
                        .build(userId))
                .header(internalHeaderName, internalSecret)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<ApiResponse<AuthUserResourceDTO>>() {})
                .timeout(AUTH_SERVICE_TIMEOUT)
                .flatMap(this::extractApiData);
    }

    private Mono<AuthUserResourceDTO> cacheAndReturn(String cacheKey, AuthUserResourceDTO dto) {
        try {
            String json = objectMapper.writeValueAsString(dto);
            return redisTemplate.opsForValue()
                    .set(cacheKey, json, Duration.ofSeconds(cacheTtlSeconds))
                    .onErrorResume(e -> Mono.just(false))
                    .thenReturn(dto);
        } catch (Exception e) {
            return Mono.just(dto);
        }
    }

    private String safeWriteJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return "null";
        }
    }

    private <T> Mono<T> extractApiData(ApiResponse<T> response) {
        if (response == null || !Integer.valueOf(200).equals(response.getCode()) || response.getData() == null) {
            return Mono.empty();
        }
        return Mono.just(response.getData());
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

    private record FilterInput(String path, String token) {
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
}
