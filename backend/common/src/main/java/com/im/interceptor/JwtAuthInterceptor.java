package com.im.interceptor;

import com.im.util.AuthHeaderUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.ApiResponse;
import com.im.security.SecurityPaths;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Component
@RequiredArgsConstructor
@Slf4j
public class JwtAuthInterceptor implements HandlerInterceptor {

    private final ObjectMapper objectMapper;
    private final ObjectProvider<StringRedisTemplate> stringRedisTemplateProvider;

    @Value("${im.security.mode:gateway}")
    private String securityMode;

    @Value("${im.security.gateway-only.enabled:false}")
    private boolean gatewayOnlyEnabled;

    @Value("${im.security.gateway-fallback-jwt.enabled:true}")
    private boolean gatewayFallbackJwtEnabled;

    @Value("${im.security.replay-protection.enabled:true}")
    private boolean replayProtectionEnabled;

    @Value("${im.security.replay-protection.ttl-seconds:300}")
    private long replayProtectionTtlSeconds;

    @Value("${im.security.replay-protection.key-prefix:im:auth:replay:}")
    private String replayProtectionKeyPrefix;

    @Value("${im.gateway.user-id-header:X-User-Id}")
    private String gatewayUserIdHeader;

    @Value("${im.gateway.username-header:X-Username}")
    private String gatewayUsernameHeader;

    @Value("${im.internal.header:X-Internal-Secret}")
    private String internalHeaderName;

    @Value("${im.internal.secret:im-internal-secret}")
    private String internalSecret;

    @Value("${im.gateway.auth.secret:im-gateway-auth-secret}")
    private String gatewayAuthSecret;

    @Value("${im.gateway.auth.max-skew-ms:300000}")
    private long maxSkewMs;

    @Value("${jwt.secret:im-backend-secret-key-for-jwt-token-generation-im-backend-secret-key-2026}")
    private String jwtSecret;

    private static final String JWT_HEADER = "Authorization";
    private static final String JWT_PREFIX = "Bearer ";

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String requestURI = request.getRequestURI();
        if (SecurityPaths.isServiceWhiteList(requestURI)) {
            return true;
        }

        if (isGatewayMode() && applyIdentityFromGatewayHeaders(request)) {
            return true;
        }

        if (isGatewayMode() && gatewayOnlyEnabled) {
            writeUnauthorized(response, "仅允许网关转发请求");
            return false;
        }

        if (!gatewayFallbackJwtEnabled) {
            writeUnauthorized(response, "认证失败");
            return false;
        }

        String authHeader = request.getHeader(JWT_HEADER);
        if (authHeader != null && authHeader.startsWith(JWT_PREFIX)) {
            String token = authHeader.substring(JWT_PREFIX.length()).trim();
            try {
                Claims claims = Jwts.parser()
                        .verifyWith(Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8)))
                        .build()
                        .parseSignedClaims(token)
                        .getPayload();

                Object userIdObj = claims.get("userId");
                if (userIdObj != null) {
                    Long userId;
                    if (userIdObj instanceof Number) {
                        userId = ((Number) userIdObj).longValue();
                    } else {
                        userId = Long.valueOf(userIdObj.toString());
                    }
                    String username = claims.getSubject();
                    
                    request.setAttribute("userId", userId);
                    request.setAttribute("username", username);
                    log.debug("从 Token 解析: userId={}, username={}", userId, username);
                    return true;
                }
            } catch (Exception e) {
                log.warn("Token 解析失败: {}", e.getMessage());
            }
        }

        writeUnauthorized(response, "认证失败");
        return false;
    }

    private boolean isGatewayMode() {
        return securityMode != null && "gateway".equalsIgnoreCase(securityMode.trim());
    }

    private boolean applyIdentityFromGatewayHeaders(HttpServletRequest request) {
        if (!hasValidInternalSecret(request)) {
            return false;
        }
        String userIdValue = request.getHeader(gatewayUserIdHeader);
        String usernameValue = request.getHeader(gatewayUsernameHeader);
        if (!hasGatewayIdentityHeaders(userIdValue, usernameValue)) {
            return false;
        }
        GatewayAuthHeaders authHeaders = readGatewayAuthHeaders(request);
        if (authHeaders.hasAny() && !applySignedGatewayAuth(request, userIdValue.trim(), usernameValue.trim(), authHeaders)) {
            return false;
        }
        try {
            Long userId = Long.valueOf(userIdValue.trim());
            request.setAttribute("userId", userId);
            request.setAttribute("username", usernameValue.trim());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean hasValidInternalSecret(HttpServletRequest request) {
        String internalHeaderValue = request.getHeader(internalHeaderName);
        return internalHeaderValue != null && internalSecret.equals(internalHeaderValue);
    }

    private boolean hasGatewayIdentityHeaders(String userIdValue, String usernameValue) {
        if (userIdValue == null || userIdValue.trim().isEmpty()) {
            return false;
        }
        return usernameValue != null && !usernameValue.trim().isEmpty();
    }

    private GatewayAuthHeaders readGatewayAuthHeaders(HttpServletRequest request) {
        return new GatewayAuthHeaders(
                request.getHeader("X-Auth-User"),
                request.getHeader("X-Auth-Perms"),
                request.getHeader("X-Auth-Data"),
                request.getHeader("X-Auth-Ts"),
                request.getHeader("X-Auth-Nonce"),
                request.getHeader("X-Auth-Sign")
        );
    }

    private boolean applySignedGatewayAuth(
            HttpServletRequest request,
            String userIdValue,
            String usernameValue,
            GatewayAuthHeaders authHeaders
    ) {
        if (!authHeaders.isComplete()) {
            return false;
        }
        Long tsLong = parseTimestamp(authHeaders.ts());
        if (tsLong == null) {
            return false;
        }
        if (!withinAllowedClockSkew(tsLong)) {
            return false;
        }
        if (replayProtectionEnabled && !tryAcquireReplayGuard(userIdValue, tsLong, authHeaders.nonce())) {
            return false;
        }
        boolean ok = AuthHeaderUtil.verifyHmacSha256(
                gatewayAuthSecret,
                AuthHeaderUtil.buildSignedFields(
                        userIdValue,
                        usernameValue,
                        authHeaders.userB64(),
                        authHeaders.permsB64(),
                        authHeaders.dataB64(),
                        authHeaders.ts(),
                        authHeaders.nonce()
                ),
                authHeaders.sign()
        );
        if (!ok) {
            return false;
        }
        return applyAuthObjectsToRequest(request, authHeaders.userB64(), authHeaders.permsB64(), authHeaders.dataB64());
    }

    private Long parseTimestamp(String ts) {
        try {
            return Long.valueOf(ts);
        } catch (Exception e) {
            return null;
        }
    }

    private boolean withinAllowedClockSkew(Long tsLong) {
        long now = System.currentTimeMillis();
        return Math.abs(now - tsLong) <= maxSkewMs;
    }

    private boolean applyAuthObjectsToRequest(HttpServletRequest request, String userB64, String permsB64, String dataB64) {
        try {
            String userJson = AuthHeaderUtil.base64UrlDecodeToString(userB64);
            String permsJson = AuthHeaderUtil.base64UrlDecodeToString(permsB64);
            String dataJson = AuthHeaderUtil.base64UrlDecodeToString(dataB64);
            Object userInfo = objectMapper.readValue(userJson, Object.class);
            Object perms = objectMapper.readValue(permsJson, Object.class);
            Object dataScopes = objectMapper.readValue(dataJson, Object.class);
            request.setAttribute("authUserInfo", userInfo);
            request.setAttribute("authPermissions", perms);
            request.setAttribute("authDataScopes", dataScopes);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean tryAcquireReplayGuard(String userId, long ts, String nonce) {
        if (nonce == null || nonce.isBlank()) {
            return false;
        }
        StringRedisTemplate redisTemplate = stringRedisTemplateProvider.getIfAvailable();
        if (redisTemplate == null) {
            return true;
        }
        String key = replayProtectionKeyPrefix + userId + ":" + ts + ":" + nonce;
        try {
            Boolean ok = redisTemplate.opsForValue().setIfAbsent(key, "1", Duration.ofSeconds(Math.max(1, replayProtectionTtlSeconds)));
            return Boolean.TRUE.equals(ok);
        } catch (Exception e) {
            return false;
        }
    }

    private record GatewayAuthHeaders(
            String userB64,
            String permsB64,
            String dataB64,
            String ts,
            String nonce,
            String sign
    ) {
        private boolean hasAny() {
            return userB64 != null || permsB64 != null || dataB64 != null || ts != null || nonce != null || sign != null;
        }

        private boolean isComplete() {
            return userB64 != null && permsB64 != null && dataB64 != null && ts != null && nonce != null && sign != null;
        }
    }

    private void writeUnauthorized(HttpServletResponse response, String message) {
        try {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write(objectMapper.writeValueAsString(ApiResponse.unauthorized(message)));
        } catch (Exception ignored) {
        }
    }
}
