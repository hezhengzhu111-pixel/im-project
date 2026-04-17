package com.im.util;

import com.im.dto.JwtLocalValidationResult;
import com.im.enums.JwtLocalValidationStatus;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

public final class JwtLocalTokenValidator {

    private JwtLocalTokenValidator() {
    }

    public static JwtLocalValidationResult validateAccessToken(String token, String secret) {
        return validateToken(token, secret, "access");
    }

    public static JwtLocalValidationResult validateRefreshToken(String token, String secret) {
        return validateToken(token, secret, "refresh");
    }

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

    private static JwtLocalValidationResult validateToken(String token, String secret, String expectedType) {
        String normalized = normalizeBearer(token);
        if (normalized == null || normalized.isBlank()) {
            return invalid();
        }
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(getSecretKey(secret))
                    .build()
                    .parseSignedClaims(normalized)
                    .getPayload();
            return fromClaims(claims, expectedType, JwtLocalValidationStatus.VALID);
        } catch (ExpiredJwtException ex) {
            return fromClaims(ex.getClaims(), expectedType, JwtLocalValidationStatus.EXPIRED);
        } catch (JwtException | IllegalArgumentException ex) {
            return invalid();
        }
    }

    private static JwtLocalValidationResult fromClaims(Claims claims,
                                                       String expectedType,
                                                       JwtLocalValidationStatus successStatus) {
        Long userId = parseUserId(claims);
        String username = stringClaim(claims, "username");
        String tokenType = stringClaim(claims, "typ");
        String jti = stringClaim(claims, "jti");
        Date issuedAt = claims == null ? null : claims.getIssuedAt();
        Date expiresAt = claims == null ? null : claims.getExpiration();
        if (userId == null
                || isBlank(username)
                || isBlank(tokenType)
                || isBlank(jti)
                || expiresAt == null
                || !expectedType.equals(tokenType)) {
            return new JwtLocalValidationResult(
                    JwtLocalValidationStatus.MISSING_REQUIRED_CLAIMS,
                    userId,
                    username,
                    tokenType,
                    jti,
                    issuedAt == null ? null : issuedAt.getTime(),
                    expiresAt == null ? null : expiresAt.getTime()
            );
        }
        return new JwtLocalValidationResult(
                successStatus,
                userId,
                username,
                tokenType,
                jti,
                issuedAt == null ? null : issuedAt.getTime(),
                expiresAt.getTime()
        );
    }

    private static JwtLocalValidationResult invalid() {
        return new JwtLocalValidationResult(JwtLocalValidationStatus.INVALID_SIGNATURE_OR_MALFORMED,
                null, null, null, null, null, null);
    }

    private static String normalizeBearer(String token) {
        if (token == null) {
            return null;
        }
        String normalized = token.trim();
        if (normalized.startsWith("Bearer ")) {
            normalized = normalized.substring("Bearer ".length()).trim();
        }
        return normalized;
    }

    private static Long parseUserId(Claims claims) {
        if (claims == null) {
            return null;
        }
        Object userId = claims.get("userId");
        if (userId instanceof Long value) {
            return value;
        }
        if (userId instanceof Integer value) {
            return value.longValue();
        }
        if (userId instanceof String value && !value.isBlank()) {
            try {
                return Long.valueOf(value);
            } catch (NumberFormatException ignore) {
                return null;
            }
        }
        return null;
    }

    private static String stringClaim(Claims claims, String key) {
        if (claims == null) {
            return null;
        }
        Object value = claims.get(key);
        if (value == null) {
            return null;
        }
        String stringValue = value.toString();
        return stringValue.isBlank() ? null : stringValue;
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
