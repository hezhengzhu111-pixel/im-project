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

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthTokenRevokeService {

    private static final String REVOKED_TOKEN_KEY_PREFIX = "auth:revoked:token:";
    private static final String REVOKED_USER_TOKENS_KEY_PREFIX = "auth:revoked:user:";

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

            if (Boolean.TRUE.equals(stringRedisTemplate.hasKey(revokedKey))) {
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
        if (token == null || token.trim().isEmpty()) {
            return false;
        }

        try {
            String tokenHash = hashToken(token);
            String revokedKey = REVOKED_TOKEN_KEY_PREFIX + tokenHash;
            return Boolean.TRUE.equals(stringRedisTemplate.hasKey(revokedKey));
        } catch (Exception e) {
            log.error("检查Token是否吊销失败", e);
            return false;
        }
    }

    public void revokeAllUserTokens(Long userId) {
        if (userId == null) {
            return;
        }

        try {
            String userRevokedKey = REVOKED_USER_TOKENS_KEY_PREFIX + userId;
            stringRedisTemplate.delete(userRevokedKey);
            log.info("用户所有Token已吊销，userId={}", userId);
        } catch (Exception e) {
            log.error("吊销用户所有Token失败，userId={}", userId, e);
        }
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
