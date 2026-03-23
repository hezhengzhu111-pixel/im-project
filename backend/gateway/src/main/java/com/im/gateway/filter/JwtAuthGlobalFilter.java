package com.im.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.im.dto.AuthUserResourceDTO;
import com.im.dto.TokenParseResultDTO;
import com.im.security.SecurityPaths;
import com.im.util.AuthHeaderUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
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

    private final ReactiveStringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final WebClient webClient;
    
    // Caffeine 缓存：10秒过期，防止频繁请求 Auth 服务
    private final Cache<String, TokenParseResultDTO> tokenCache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(10))
            .maximumSize(10000)
            .build();
            
    private final Cache<Long, AuthUserResourceDTO> resourceCache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(10))
            .maximumSize(10000)
            .build();

    @Value("${im.internal.header:X-Internal-Secret}")
    private String internalHeaderName;

    @Value("${im.internal.secret:im-internal-secret}")
    private String internalSecret;

    @Value("${im.gateway.auth.user-resource-key-prefix:auth:user:}")
    private String userResourceKeyPrefix;

    @Value("${im.gateway.auth.cache-ttl-seconds:3600}")
    private long cacheTtlSeconds;

    @Value("${im.gateway.auth.secret:im-gateway-auth-secret}")
    private String gatewayAuthSecret;

    @Value("${im.security.token-revocation-check.enabled:true}")
    private boolean tokenRevocationCheckEnabled;

    @Value("${jwt.header:Authorization}")
    private String jwtHeader;

    @Value("${jwt.prefix:Bearer }")
    private String jwtPrefix;

    public JwtAuthGlobalFilter(ReactiveStringRedisTemplate redisTemplate,
                               ObjectMapper objectMapper,
                               WebClient.Builder webClientBuilder,
                               @Value("${im.gateway.auth-service-url:http://auth-service}") String authServiceUrl) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.webClient = webClientBuilder.baseUrl(authServiceUrl).build();
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        FilterInput input = filterInput(exchange);
        InputStageResult inputStageResult = filterInputStage(input);
        Mono<Void> inputOutput = filterInputOutput(exchange, chain, inputStageResult);
        if (inputOutput != null) {
            return inputOutput;
        }
        return filterProcess(exchange, chain, input)
                .onErrorResume(e -> {
                    exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                    return exchange.getResponse().setComplete();
                });
    }

    private FilterInput filterInput(ServerWebExchange exchange) {
        String path = exchange.getRequest().getURI().getPath();
        String internalHeaderValue = exchange.getRequest().getHeaders().getFirst(internalHeaderName);
        String authHeader = exchange.getRequest().getHeaders().getFirst(jwtHeader);
        String token = extractTokenFromHeader(authHeader);
        return new FilterInput(path, internalHeaderValue, token);
    }

    private InputStageResult filterInputStage(FilterInput input) {
        if (SecurityPaths.isGatewayWhiteList(input.path())) {
            return InputStageResult.passThrough();
        }
        if (SecurityPaths.isGatewayInternalPath(input.path())) {
            if (input.internalHeaderValue() == null || !input.internalHeaderValue().equals(internalSecret)) {
                return InputStageResult.reject(HttpStatus.FORBIDDEN);
            }
            return InputStageResult.passThrough();
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
        String cacheKey = userResourceKeyPrefix + userId;
        return redisTemplate.opsForValue().get(cacheKey)
                .flatMap(json -> {
                    AuthUserResourceDTO dto = tryParseUserResource(json);
                    if (dto == null || dto.getUserId() == null || !userId.equals(dto.getUserId())) {
                        return loadUserResourceFromAuthService(userId).flatMap(loaded -> cacheAndReturn(cacheKey, loaded));
                    }
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
        if (cached != null) {
            return Mono.just(cached);
        }

        return webClient.post()
                .uri("/api/auth/internal/validate-token")
                .header(internalHeaderName, internalSecret)
                .header("X-Check-Revoked", String.valueOf(tokenRevocationCheckEnabled))
                .bodyValue(token)
                .retrieve()
                .bodyToMono(TokenParseResultDTO.class)
                .doOnNext(res -> {
                    if (res != null) {
                        tokenCache.put(token, res);
                    }
                })
                .onErrorResume(e -> Mono.empty());
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
        if (cached != null) {
            return Mono.just(cached);
        }

        return webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/api/auth/internal/user-resource/{userId}")
                        .build(userId))
                .header(internalHeaderName, internalSecret)
                .retrieve()
                .bodyToMono(AuthUserResourceDTO.class)
                .doOnNext(res -> {
                    if (res != null) {
                        resourceCache.put(userId, res);
                    }
                })
                .onErrorResume(e -> Mono.empty());
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

    private record FilterInput(String path, String internalHeaderValue, String token) {
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
