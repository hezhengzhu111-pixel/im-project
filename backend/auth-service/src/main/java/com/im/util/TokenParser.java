package com.im.util;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.Data;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

import static com.im.service.AuthTokenService.getSecretKey;

@Slf4j
@Component
public class TokenParser {

    @Value("${jwt.secret}")
    private String accessSecret;

    @Value("${auth.refresh.secret}")
    private String refreshSecret;

    public TokenParseInfo parseAccessToken(String token) {
        return parseToken(token, accessSecret);
    }

    public TokenParseInfo parseRefreshToken(String token) {
        return parseToken(token, refreshSecret);
    }

    private TokenParseInfo parseToken(String token, String secret) {
        TokenParseInfo info = new TokenParseInfo();
        if (token == null || token.trim().isEmpty()) {
            info.setValid(false);
            info.setError("token为空");
            return info;
        }

        String normalized = normalizeBearer(token);
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(getSigningKey(secret))
                    .build()
                    .parseSignedClaims(normalized)
                    .getPayload();
            fillFromClaims(info, claims, false);
            info.setValid(true);
            return info;
        } catch (ExpiredJwtException e) {
            fillFromClaims(info, e.getClaims(), true);
            info.setExpired(true);
            info.setValid(false);
            info.setError("token已过期");
            return info;
        } catch (Exception e) {
            info.setValid(false);
            info.setError("token无效");
            log.warn("解析token失败: {}", e.getMessage());
            return info;
        }
    }

    private void fillFromClaims(TokenParseInfo out, Claims claims, boolean expired) {
        out.setExpired(expired);
        if (claims == null) {
            return;
        }
        Object uid = claims.get("userId");
        if (uid instanceof Integer) {
            out.setUserId(((Integer) uid).longValue());
        } else if (uid instanceof Long) {
            out.setUserId((Long) uid);
        } else if (uid instanceof String) {
            try {
                out.setUserId(Long.valueOf((String) uid));
            } catch (Exception ignore) {
            }
        }
        out.setUsername(claims.get("username", String.class));
        out.setTokenType(claims.get("typ", String.class));
        out.setJti(claims.get("jti", String.class));
        Date iat = claims.getIssuedAt();
        Date exp = claims.getExpiration();
        out.setIssuedAtEpochMs(iat == null ? null : iat.getTime());
        out.setExpiresAtEpochMs(exp == null ? null : exp.getTime());
    }

    private SecretKey getSigningKey(String secret) {
        return getSecretKey(secret);
    }

    private String normalizeBearer(String token) {
        String t = token.trim();
        if (t.startsWith("Bearer ")) {
            t = t.substring("Bearer ".length()).trim();
        }
        return t;
    }

    @Data
    public static class TokenParseInfo {
        private boolean valid;
        private boolean expired;
        private String error;
        private Long userId;
        private String username;
        private String tokenType;
        private String jti;
        private Long issuedAtEpochMs;
        private Long expiresAtEpochMs;
    }
}
