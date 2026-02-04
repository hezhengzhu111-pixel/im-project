package com.im.util;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
public class TokenParser {

    @Value("${jwt.secret:im-backend-secret-key-for-jwt-token-generation}")
    private String accessSecret;

    @Value("${auth.refresh.secret:im-backend-refresh-secret-key}")
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

        public boolean isValid() {
            return valid;
        }

        public void setValid(boolean valid) {
            this.valid = valid;
        }

        public boolean isExpired() {
            return expired;
        }

        public void setExpired(boolean expired) {
            this.expired = expired;
        }

        public String getError() {
            return error;
        }

        public void setError(String error) {
            this.error = error;
        }

        public Long getUserId() {
            return userId;
        }

        public void setUserId(Long userId) {
            this.userId = userId;
        }

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getTokenType() {
            return tokenType;
        }

        public void setTokenType(String tokenType) {
            this.tokenType = tokenType;
        }

        public String getJti() {
            return jti;
        }

        public void setJti(String jti) {
            this.jti = jti;
        }

        public Long getIssuedAtEpochMs() {
            return issuedAtEpochMs;
        }

        public void setIssuedAtEpochMs(Long issuedAtEpochMs) {
            this.issuedAtEpochMs = issuedAtEpochMs;
        }

        public Long getExpiresAtEpochMs() {
            return expiresAtEpochMs;
        }

        public void setExpiresAtEpochMs(Long expiresAtEpochMs) {
            this.expiresAtEpochMs = expiresAtEpochMs;
        }
    }
}
