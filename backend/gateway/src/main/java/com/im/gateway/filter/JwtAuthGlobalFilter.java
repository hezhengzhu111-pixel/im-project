package com.im.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
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

    private final ReactiveStringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final WebClient webClient;

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

    @Value("${auth.service.url:http://im-auth:8084}")
    private String authServiceUrl;

    @Value("${im.security.token-revocation-check.enabled:true}")
    private boolean tokenRevocationCheckEnabled;

    @Value("${jwt.header:Authorization}")
    private String jwtHeader;

    @Value("${jwt.prefix:Bearer }")
    private String jwtPrefix;

    public JwtAuthGlobalFilter(ReactiveStringRedisTemplate redisTemplate,
                               ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.webClient = WebClient.builder().build();
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();
        
        if (SecurityPaths.isGatewayWhiteList(path)) {
            return chain.filter(exchange);
        }

        if (SecurityPaths.isGatewayInternalPath(path)) {
            String internalHeaderValue = exchange.getRequest().getHeaders().getFirst(internalHeaderName);
            if (internalHeaderValue == null || !internalHeaderValue.equals(internalSecret)) {
                exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
                return exchange.getResponse().setComplete();
            }
            return chain.filter(exchange);
        }

        String authHeader = exchange.getRequest().getHeaders().getFirst(jwtHeader);
        String token = extractTokenFromHeader(authHeader);
        if (token == null || token.trim().isEmpty()) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        return validateToken(token)
                .flatMap(result -> {
                    if (result == null || !result.isValid() || result.isExpired()) {
                        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                        return exchange.getResponse().setComplete();
                    }

                    Long userId = result.getUserId();
                    String username = result.getUsername();
                    if (userId == null || username == null) {
                        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                        return exchange.getResponse().setComplete();
                    }

                    String cacheKey = userResourceKeyPrefix + userId;
                    return redisTemplate.opsForValue().get(cacheKey)
                            .flatMap(json -> {
                                AuthUserResourceDTO dto = tryParseUserResource(json);
                                if (dto == null || dto.getUserId() == null || !userId.equals(dto.getUserId())) {
                                    return loadUserResourceFromAuthService(userId)
                                            .flatMap(loaded -> cacheAndReturn(cacheKey, loaded));
                                }
                                return Mono.just(dto);
                            })
                            .switchIfEmpty(loadUserResourceFromAuthService(userId).flatMap(loaded -> cacheAndReturn(cacheKey, loaded)))
                            .flatMap(userResource -> {
                                String userInfoJson = safeWriteJson(userResource.getUserInfo());
                                String permsJson = safeWriteJson(userResource.getResourcePermissions());
                                String dataJson = safeWriteJson(userResource.getDataScopes());

                                String userB64 = AuthHeaderUtil.base64UrlEncode(userInfoJson);
                                String permsB64 = AuthHeaderUtil.base64UrlEncode(permsJson);
                                String dataB64 = AuthHeaderUtil.base64UrlEncode(dataJson);

                                String ts = String.valueOf(System.currentTimeMillis());
                                String nonce = UUID.randomUUID().toString();

                                String signature = AuthHeaderUtil.signHmacSha256(gatewayAuthSecret,
                                        AuthHeaderUtil.buildSignedFields(String.valueOf(userId), username, userB64, permsB64, dataB64, ts, nonce));

                                ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                                        .headers(headers -> {
                                            headers.remove("X-User-Id");
                                            headers.remove("X-Username");
                                            headers.remove(internalHeaderName);
                                            headers.remove("X-Auth-User");
                                            headers.remove("X-Auth-Perms");
                                            headers.remove("X-Auth-Data");
                                            headers.remove("X-Auth-Ts");
                                            headers.remove("X-Auth-Nonce");
                                            headers.remove("X-Auth-Sign");
                                            headers.set("X-User-Id", String.valueOf(userId));
                                            headers.set("X-Username", username);
                                            headers.set(internalHeaderName, internalSecret);
                                            headers.set("X-Auth-User", userB64);
                                            headers.set("X-Auth-Perms", permsB64);
                                            headers.set("X-Auth-Data", dataB64);
                                            headers.set("X-Auth-Ts", ts);
                                            headers.set("X-Auth-Nonce", nonce);
                                            headers.set("X-Auth-Sign", signature);
                                        })
                                        .build();

                                return chain.filter(exchange.mutate().request(mutatedRequest).build());
                            });
                })
                .onErrorResume(e -> {
                    exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                    return exchange.getResponse().setComplete();
                });
    }

    private Mono<TokenParseResultDTO> validateToken(String token) {
        return webClient
                .post()
                .uri(authServiceUrl + "/api/auth/internal/validate-token")
                .header(internalHeaderName, internalSecret)
                .header("X-Check-Revoked", String.valueOf(tokenRevocationCheckEnabled))
                .bodyValue(token)
                .retrieve()
                .bodyToMono(TokenParseResultDTO.class)
                .onErrorResume(e -> Mono.just(new TokenParseResultDTO()));
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
        return webClient
                .get()
                .uri(authServiceUrl + "/api/auth/internal/user-resource/{userId}", userId)
                .header(internalHeaderName, internalSecret)
                .retrieve()
                .bodyToMono(AuthUserResourceDTO.class)
                .onErrorResume(e -> Mono.just(emptyUserResource(userId)));
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

    private AuthUserResourceDTO emptyUserResource(Long userId) {
        AuthUserResourceDTO dto = new AuthUserResourceDTO();
        dto.setUserId(userId);
        dto.setResourcePermissions(java.util.Collections.emptyList());
        dto.setDataScopes(java.util.Collections.emptyMap());
        dto.setUserInfo(java.util.Collections.emptyMap());
        return dto;
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
}
