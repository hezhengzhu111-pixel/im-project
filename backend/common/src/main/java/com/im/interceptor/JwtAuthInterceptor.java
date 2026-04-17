package com.im.interceptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.ApiResponse;
import com.im.filter.InternalRequestBodyCachingFilter;
import com.im.security.SecurityPaths;
import com.im.util.AuthHeaderUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.Duration;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@RequiredArgsConstructor
@Slf4j
public class JwtAuthInterceptor implements HandlerInterceptor {
    private static final long REPLAY_GUARD_TTL_GRACE_SECONDS = 10L;
    private static final byte[] EMPTY_BODY = new byte[0];

    private final ObjectMapper objectMapper;
    private final ObjectProvider<StringRedisTemplate> stringRedisTemplateProvider;

    @Value("${im.security.mode:gateway}")
    private String securityMode;

    @Value("${im.security.gateway-only.enabled:false}")
    private boolean gatewayOnlyEnabled;

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

    @Value("${im.internal.secret}")
    private String internalSecret;

    @Value("${im.internal.max-skew-ms:300000}")
    private long internalMaxSkewMs;

    @Value("${im.internal.replay.ttl-seconds:300}")
    private long internalReplayTtlSeconds;

    @Value("${im.internal.replay.key-prefix:im:internal:replay:}")
    private String internalReplayKeyPrefix;

    @Value("${im.internal.legacy-secret-only.enabled:false}")
    private boolean internalLegacySecretOnlyEnabled;

    @Value("${im.gateway.auth.secret}")
    private String gatewayAuthSecret;

    @Value("${im.gateway.auth.max-skew-ms:300000}")
    private long maxSkewMs;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String requestURI = request.getRequestURI();
        if (SecurityPaths.isInternalSecretPath(requestURI)) {
            if (hasValidInternalSignature(request, requestURI)) {
                return true;
            }
            if (internalLegacySecretOnlyEnabled && hasValidInternalSecret(request)) {
                return true;
            }
            writeUnauthorized(response, "internal auth failed");
            return false;
        }

        if (SecurityPaths.isServiceWhiteList(requestURI)) {
            return true;
        }

        if (isGatewayMode() && applyIdentityFromGatewayHeaders(request)) {
            return true;
        }

        if (isGatewayMode() && gatewayOnlyEnabled) {
            writeUnauthorized(response, "gateway forwarding required");
            return false;
        }

        writeUnauthorized(response, "authentication failed");
        return false;
    }

    private boolean isGatewayMode() {
        return securityMode != null && "gateway".equalsIgnoreCase(securityMode.trim());
    }

    private boolean hasValidInternalSignature(HttpServletRequest request, String requestURI) {
        InternalRequestHeaders headers = readInternalRequestHeaders(request);
        if (!headers.isComplete()) {
            return false;
        }

        Long timestamp = parseTimestamp(headers.timestamp());
        if (timestamp == null || !withinAllowedClockSkew(timestamp, internalMaxSkewMs)) {
            return false;
        }

        byte[] body = readCachedBody(request);
        String bodyHash = AuthHeaderUtil.sha256Base64Url(body);
        if (!AuthHeaderUtil.verifyHmacSha256(
                internalSecret,
                AuthHeaderUtil.buildInternalSignedFields(
                        request.getMethod(),
                        requestURI,
                        bodyHash,
                        headers.timestamp(),
                        headers.nonce()
                ),
                headers.signature()
        )) {
            return false;
        }

        return tryAcquireInternalReplayGuard(headers.nonce(), timestamp);
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
        if (!authHeaders.isComplete() || !applySignedGatewayAuth(request, userIdValue.trim(), usernameValue.trim(), authHeaders)) {
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

    private InternalRequestHeaders readInternalRequestHeaders(HttpServletRequest request) {
        return new InternalRequestHeaders(
                request.getHeader(AuthHeaderUtil.INTERNAL_TIMESTAMP_HEADER),
                request.getHeader(AuthHeaderUtil.INTERNAL_NONCE_HEADER),
                request.getHeader(AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER)
        );
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
        if (!withinAllowedClockSkew(tsLong, maxSkewMs)) {
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

    private boolean withinAllowedClockSkew(long tsLong, long allowedSkewMs) {
        long now = System.currentTimeMillis();
        return Math.abs(now - tsLong) <= allowedSkewMs;
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

    private byte[] readCachedBody(HttpServletRequest request) {
        Object cachedBody = request.getAttribute(InternalRequestBodyCachingFilter.CACHED_BODY_ATTRIBUTE);
        if (cachedBody instanceof byte[] bytes) {
            return bytes;
        }
        return EMPTY_BODY;
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
            long now = System.currentTimeMillis();
            long remainingSeconds = Math.max(1L, (ts + maxSkewMs - now) / 1000L);
            long ttlSeconds = Math.max(replayProtectionTtlSeconds, remainingSeconds) + REPLAY_GUARD_TTL_GRACE_SECONDS;
            Boolean ok = redisTemplate.opsForValue().setIfAbsent(key, "1", Duration.ofSeconds(ttlSeconds));
            return Boolean.TRUE.equals(ok);
        } catch (Exception e) {
            return false;
        }
    }

    private boolean tryAcquireInternalReplayGuard(String nonce, long ts) {
        if (nonce == null || nonce.isBlank()) {
            return false;
        }

        StringRedisTemplate redisTemplate = stringRedisTemplateProvider.getIfAvailable();
        if (redisTemplate == null) {
            return false;
        }

        String key = internalReplayKeyPrefix + nonce;
        try {
            long now = System.currentTimeMillis();
            long remainingSeconds = Math.max(1L, (ts + internalMaxSkewMs - now) / 1000L);
            long ttlSeconds = Math.max(internalReplayTtlSeconds, remainingSeconds) + REPLAY_GUARD_TTL_GRACE_SECONDS;
            Boolean ok = redisTemplate.opsForValue().setIfAbsent(key, "1", Duration.ofSeconds(ttlSeconds));
            return Boolean.TRUE.equals(ok);
        } catch (Exception e) {
            log.warn("internal replay guard failed", e);
            return false;
        }
    }

    private record InternalRequestHeaders(
            String timestamp,
            String nonce,
            String signature
    ) {
        private boolean isComplete() {
            return timestamp != null && nonce != null && signature != null;
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
