package com.im.gateway.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.config.RateLimitGlobalProperties;
import com.im.dto.AuthUserResourceDTO;
import com.im.util.AuthHeaderUtil;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

import java.util.UUID;

@Component
public class GatewayIdentityHeaderSupport {
    public static final String HEADER_USER_ID = "X-User-Id";
    public static final String HEADER_USERNAME = "X-Username";
    public static final String HEADER_AUTH_USER = "X-Auth-User";
    public static final String HEADER_AUTH_PERMS = "X-Auth-Perms";
    public static final String HEADER_AUTH_DATA = "X-Auth-Data";
    public static final String HEADER_AUTH_TS = "X-Auth-Ts";
    public static final String HEADER_AUTH_NONCE = "X-Auth-Nonce";
    public static final String HEADER_AUTH_SIGN = "X-Auth-Sign";
    public static final String HEADER_RATE_LIMIT_GLOBAL_ENABLED = RateLimitGlobalProperties.SWITCH_HEADER;

    private final ObjectMapper objectMapper;

    public GatewayIdentityHeaderSupport(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public ServerWebExchange sanitizeIncoming(ServerWebExchange exchange, String internalHeaderName) {
        ServerHttpRequest sanitizedRequest = exchange.getRequest().mutate()
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
                })
                .build();
        return exchange.mutate().request(sanitizedRequest).build();
    }

    public ServerWebExchange decorate(ServerWebExchange exchange,
                                      Long userId,
                                      String username,
                                      AuthUserResourceDTO userResource,
                                      String internalHeaderName,
                                      String internalSecret,
                                      String gatewayAuthSecret,
                                      boolean rateLimitGlobalEnabled) {
        SignedAuthHeaders signedHeaders = buildSignedAuthHeaders(userId, username, userResource, gatewayAuthSecret);
        ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                .headers(headers -> {
                    headers.remove(HEADER_RATE_LIMIT_GLOBAL_ENABLED);
                    headers.set(HEADER_USER_ID, String.valueOf(userId));
                    headers.set(HEADER_USERNAME, username);
                    headers.set(internalHeaderName, internalSecret);
                    headers.set(HEADER_AUTH_USER, signedHeaders.userB64());
                    headers.set(HEADER_AUTH_PERMS, signedHeaders.permsB64());
                    headers.set(HEADER_AUTH_DATA, signedHeaders.dataB64());
                    headers.set(HEADER_AUTH_TS, signedHeaders.ts());
                    headers.set(HEADER_AUTH_NONCE, signedHeaders.nonce());
                    headers.set(HEADER_AUTH_SIGN, signedHeaders.signature());
                    headers.set(HEADER_RATE_LIMIT_GLOBAL_ENABLED, Boolean.toString(rateLimitGlobalEnabled));
                })
                .build();
        return exchange.mutate().request(mutatedRequest).build();
    }

    private SignedAuthHeaders buildSignedAuthHeaders(Long userId,
                                                     String username,
                                                     AuthUserResourceDTO userResource,
                                                     String gatewayAuthSecret) {
        String userInfoJson = safeWriteJson(userResource == null ? null : userResource.getUserInfo());
        String permsJson = safeWriteJson(userResource == null ? null : userResource.getResourcePermissions());
        String dataJson = safeWriteJson(userResource == null ? null : userResource.getDataScopes());
        String userB64 = AuthHeaderUtil.base64UrlEncode(userInfoJson);
        String permsB64 = AuthHeaderUtil.base64UrlEncode(permsJson);
        String dataB64 = AuthHeaderUtil.base64UrlEncode(dataJson);
        String ts = String.valueOf(System.currentTimeMillis());
        String nonce = UUID.randomUUID().toString();
        String signature = AuthHeaderUtil.signHmacSha256(
                gatewayAuthSecret,
                AuthHeaderUtil.buildSignedFields(
                        String.valueOf(userId),
                        username,
                        userB64,
                        permsB64,
                        dataB64,
                        ts,
                        nonce
                )
        );
        return new SignedAuthHeaders(userB64, permsB64, dataB64, ts, nonce, signature);
    }

    private String safeWriteJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return "null";
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
