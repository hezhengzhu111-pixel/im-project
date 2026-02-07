package com.im.service;

import com.im.dto.TokenPairDTO;
import com.im.dto.TokenParseResultDTO;
import com.im.dto.request.RefreshTokenRequest;
import com.im.util.TokenParser;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.checkerframework.checker.nullness.qual.NonNull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthTokenService {

    private static final String REFRESH_JTI_KEY_PREFIX = "auth:refresh:jti:";

    private final StringRedisTemplate stringRedisTemplate;
    private final AuthUserResourceService authUserResourceService;
    private final TokenParser tokenParser;

    @Value("${jwt.secret:im-backend-secret-key-for-jwt-token-generation}")
    private String accessSecret;

    @Value("${jwt.expiration:86400000}")
    private long accessExpirationMs;

    @Value("${auth.refresh.secret:im-backend-refresh-secret-key}")
    private String refreshSecret;

    @Value("${auth.refresh.expiration:604800000}")
    private long refreshExpirationMs;

    public TokenPairDTO issueTokenPair(Long userId, String username) {
        if (userId == null || username == null || username.trim().isEmpty()) {
            throw new IllegalArgumentException("userId/username不能为空");
        }

        String accessJti = UUID.randomUUID().toString();
        String refreshJti = UUID.randomUUID().toString();

        String accessToken = buildToken(accessSecret, accessExpirationMs, userId, username, "access", accessJti);
        String refreshToken = buildToken(refreshSecret, refreshExpirationMs, userId, username, "refresh", refreshJti);

        storeRefreshJti(userId, refreshJti);
        authUserResourceService.getOrLoad(userId);

        TokenPairDTO dto = new TokenPairDTO();
        dto.setAccessToken(accessToken);
        dto.setRefreshToken(refreshToken);
        dto.setExpiresInMs(accessExpirationMs);
        dto.setRefreshExpiresInMs(refreshExpirationMs);
        return dto;
    }

    public TokenPairDTO refresh(RefreshTokenRequest request) {
        if (request == null || request.getRefreshToken() == null || request.getRefreshToken().trim().isEmpty()) {
            throw new IllegalArgumentException("refreshToken不能为空");
        }

        TokenParser.TokenParseInfo refreshParsed = tokenParser.parseRefreshToken(request.getRefreshToken());
        if (refreshParsed.isExpired()) {
            throw new SecurityException("refreshToken已过期");
        }
        if (!refreshParsed.isValid()) {
            throw new SecurityException(refreshParsed.getError() == null ? "refreshToken无效" : refreshParsed.getError());
        }
        if (!"refresh".equals(refreshParsed.getTokenType())) {
            throw new SecurityException("token类型错误");
        }

        Long userId = refreshParsed.getUserId();
        String username = refreshParsed.getUsername();
        String refreshJti = refreshParsed.getJti();
        if (userId == null || username == null || refreshJti == null) {
            throw new SecurityException("refreshToken解析失败");
        }

        String storedJti = stringRedisTemplate.opsForValue().get(REFRESH_JTI_KEY_PREFIX + userId);
        if (storedJti == null || !storedJti.equals(refreshJti)) {
            throw new SecurityException("refreshToken已失效");
        }

        if (request.getAccessToken() != null && !request.getAccessToken().trim().isEmpty()) {
            TokenParser.TokenParseInfo accessParsed = tokenParser.parseAccessToken(request.getAccessToken());
            if (accessParsed.getUserId() != null && !userId.equals(accessParsed.getUserId())) {
                throw new SecurityException("accessToken与refreshToken不匹配");
            }
            if (accessParsed.getUsername() != null && !username.equals(accessParsed.getUsername())) {
                throw new SecurityException("accessToken与refreshToken不匹配");
            }
        }

        return issueTokenPair(userId, username);
    }

    public TokenParseResultDTO parseAccessToken(String token, boolean allowExpired) {
        TokenParser.TokenParseInfo info = tokenParser.parseAccessToken(token);
        return convertToResultDTO(info, allowExpired);
    }

    public TokenParseResultDTO parseRefreshToken(String token, boolean allowExpired) {
        TokenParser.TokenParseInfo info = tokenParser.parseRefreshToken(token);
        return convertToResultDTO(info, allowExpired);
    }

    private TokenParseResultDTO convertToResultDTO(TokenParser.TokenParseInfo info, boolean allowExpired) {
        TokenParseResultDTO result = new TokenParseResultDTO();
        result.setValid(info.isValid());
        result.setExpired(info.isExpired());
        result.setError(info.getError());
        result.setUserId(info.getUserId());
        result.setUsername(info.getUsername());
        result.setTokenType(info.getTokenType());
        result.setJti(info.getJti());
        result.setIssuedAtEpochMs(info.getIssuedAtEpochMs());
        result.setExpiresAtEpochMs(info.getExpiresAtEpochMs());
        
        if (!allowExpired && result.isExpired()) {
            result.setUserId(null);
            result.setUsername(null);
            result.setIssuedAtEpochMs(null);
            result.setExpiresAtEpochMs(null);
            result.setJti(null);
            result.setTokenType(null);
        }
        
        return result;
    }

    private void storeRefreshJti(Long userId, String refreshJti) {
        stringRedisTemplate.opsForValue().set(REFRESH_JTI_KEY_PREFIX + userId, refreshJti, Duration.ofMillis(refreshExpirationMs));
    }

    private String buildToken(String secret, long expirationMs, Long userId, String username, String typ, String jti) {
        Date now = new Date();
        Date exp = new Date(now.getTime() + expirationMs);
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", userId);
        claims.put("username", username);
        claims.put("typ", typ);
        claims.put("jti", jti);
        return Jwts.builder()
                .setClaims(claims)
                .setSubject(username)
                .setIssuedAt(now)
                .setExpiration(exp)
                .signWith(getSigningKey(secret), SignatureAlgorithm.HS512)
                .compact();
    }

    private SecretKey getSigningKey(String secret) {
        return getSecretKey(secret);
    }

    @NonNull
    public static SecretKey getSecretKey(String secret) {
        String effectiveSecret = secret == null ? "" : secret;
        byte[] keyBytes = effectiveSecret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length >= 64) {
            return Keys.hmacShaKeyFor(keyBytes);
        }
        byte[] padded = new byte[64];
        for (int i = 0; i < padded.length; i++) {
            padded[i] = keyBytes[i % Math.max(1, keyBytes.length)];
        }
        return Keys.hmacShaKeyFor(padded);
    }

    private String normalizeBearer(String token) {
        String t = token.trim();
        if (t.startsWith("Bearer ")) {
            t = t.substring("Bearer ".length()).trim();
        }
        return t;
    }
}
