package com.im.service;

import com.im.dto.TokenRevokeResultDTO;
import com.im.dto.TokenParseResultDTO;
import com.im.dto.request.RevokeTokenRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthTokenRevokeService {

    private static final String REVOKED_TOKEN_KEY_PREFIX = "auth:revoked:token:";
    private static final String REVOKED_USER_TOKENS_KEY_PREFIX = "auth:revoked:user:";
    private static final String USER_REVOKE_AFTER_KEY_PREFIX = "auth:user:revoke_after:";
    private static final String REFRESH_JTI_KEY_PREFIX = "auth:refresh:jti:";
    private static final String PREVIOUS_REFRESH_KEY_PREFIX = "auth:refresh:previous:";
    private static final String USER_RESOURCE_KEY_PREFIX = "auth:user:";

    private final StringRedisTemplate stringRedisTemplate;
    private final AuthTokenService authTokenService;

    @Value("${auth.revoke.token-ttl-seconds:86400}")
    private long revokedTokenTtlSeconds;

    public TokenRevokeResultDTO revokeToken(RevokeTokenRequest request) {
        TokenRevokeResultDTO result = new TokenRevokeResultDTO();

        if (request == null || request.getToken() == null || request.getToken().trim().isEmpty()) {
            result.setSuccess(false);
            result.setMessage("Token不能为空");
            return result;
        }

        try {
            TokenParseResultDTO parsed = authTokenService.parseAccessToken(request.getToken(), true);
            if (parsed == null || parsed.getUserId() == null) {
                result.setSuccess(false);
                result.setMessage("Token解析失败");
                return result;
            }

            Long userId = parsed.getUserId();
            String tokenType = parsed.getTokenType();
            result.setUserId(userId);
            result.setTokenType(tokenType);

            String tokenHash = hashToken(request.getToken());
            String revokedKey = REVOKED_TOKEN_KEY_PREFIX + tokenHash;

            if (stringRedisTemplate.hasKey(revokedKey)) {
                result.setSuccess(false);
                result.setMessage("Token已被吊销");
                return result;
            }

            stringRedisTemplate.opsForValue().set(revokedKey, "1", Duration.ofSeconds(revokedTokenTtlSeconds));

            String userRevokedKey = REVOKED_USER_TOKENS_KEY_PREFIX + userId;
            stringRedisTemplate.opsForSet().add(userRevokedKey, tokenHash);
            stringRedisTemplate.expire(userRevokedKey, Duration.ofSeconds(revokedTokenTtlSeconds));

            result.setSuccess(true);
            result.setMessage(request.getReason() != null ? request.getReason() : "Token已吊销");
            log.info("Token已吊销，userId={}, tokenType={}, reason={}", userId, tokenType, request.getReason());
            return result;
        } catch (Exception e) {
            log.error("吊销Token失败", e);
            result.setSuccess(false);
            result.setMessage("吊销Token失败：" + e.getMessage());
            return result;
        }
    }

    public boolean isTokenRevoked(String token) {
        TokenParseResultDTO parsed = null;
        try {
            parsed = authTokenService.parseAccessToken(token, true);
        } catch (Exception ignored) {
        }
        return isTokenRevoked(token, parsed);
    }

    public boolean isTokenRevoked(String token, TokenParseResultDTO parsed) {
        if (token == null || token.trim().isEmpty()) {
            return false;
        }

        try {
            String tokenHash = hashToken(token);
            String revokedKey = REVOKED_TOKEN_KEY_PREFIX + tokenHash;
            if (Boolean.TRUE.equals(stringRedisTemplate.hasKey(revokedKey))) {
                return true;
            }
            return isUserTokenRevoked(parsed);
        } catch (Exception e) {
            log.error("检查Token是否吊销失败", e);
            return false;
        }
    }

    public boolean isUserTokenRevoked(TokenParseResultDTO parsed) {
        if (parsed == null || parsed.getUserId() == null || parsed.getIssuedAtEpochMs() == null) {
            return false;
        }
        try {
            String revokeAfterValue = stringRedisTemplate.opsForValue()
                    .get(USER_REVOKE_AFTER_KEY_PREFIX + parsed.getUserId());
            if (revokeAfterValue == null || revokeAfterValue.isBlank()) {
                return false;
            }
            long revokeAfterMs = Long.parseLong(revokeAfterValue.trim());
            return parsed.getIssuedAtEpochMs() <= revokeAfterMs;
        } catch (Exception e) {
            log.error("检查用户Token撤销时间失败，userId={}", parsed.getUserId(), e);
            return true;
        }
    }

    public void revokeAllUserTokens(Long userId) {
        if (userId == null) {
            return;
        }

        try {
            stringRedisTemplate.opsForValue().set(
                    USER_REVOKE_AFTER_KEY_PREFIX + userId,
                    String.valueOf(System.currentTimeMillis()),
                    Duration.ofSeconds(revokedTokenTtlSeconds)
            );
            stringRedisTemplate.delete(REFRESH_JTI_KEY_PREFIX + userId);
            stringRedisTemplate.delete(USER_RESOURCE_KEY_PREFIX + userId);
            deletePreviousRefreshKeys(userId);
            log.info("用户所有Token已吊销，userId={}", userId);
        } catch (Exception e) {
            log.error("吊销用户所有Token失败，userId={}", userId, e);
        }
    }

    private void deletePreviousRefreshKeys(Long userId) {
        Set<String> keys = stringRedisTemplate.keys(PREVIOUS_REFRESH_KEY_PREFIX + userId + ":*");
        if (keys != null && !keys.isEmpty()) {
            stringRedisTemplate.delete(keys);
        }
        stringRedisTemplate.delete(REVOKED_USER_TOKENS_KEY_PREFIX + userId);
    }

    private String hashToken(String token) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(token.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) {
                    hexString.append('0');
                }
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            throw new RuntimeException("Token哈希失败", e);
        }
    }
}
