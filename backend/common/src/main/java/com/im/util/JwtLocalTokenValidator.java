package com.im.util;

import com.im.dto.JwtLocalValidationResult;
import com.im.enums.JwtLocalValidationStatus;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public class JwtLocalTokenValidator {

    public static final String ACCESS_SECRET_KEY_BEAN_NAME = "jwtAccessSecretKey";
    public static final String ACCESS_JWT_PARSER_BEAN_NAME = "jwtAccessJwtParser";
    private static final int HMAC_KEY_SIZE_BYTES = 64;
    private static final ConcurrentMap<String, SecretKey> SECRET_KEY_CACHE = new ConcurrentHashMap<>();
    private static final ConcurrentMap<String, JwtParser> JWT_PARSER_CACHE = new ConcurrentHashMap<>();

    private final SecretKey accessSecretKey;
    private final JwtParser accessJwtParser;

    public JwtLocalTokenValidator(@Qualifier(ACCESS_SECRET_KEY_BEAN_NAME) SecretKey accessSecretKey,
                                  @Qualifier(ACCESS_JWT_PARSER_BEAN_NAME) JwtParser accessJwtParser) {
        this.accessSecretKey = accessSecretKey;
        this.accessJwtParser = accessJwtParser;
    }

    public JwtLocalValidationResult validateAccessToken(String token) {
        return validateToken(token, accessJwtParser, "access");
    }

    public SecretKey accessSecretKey() {
        return accessSecretKey;
    }

    public JwtParser accessJwtParser() {
        return accessJwtParser;
    }

    public static JwtLocalValidationResult validateAccessToken(String token, String secret) {
        return validateToken(token, getJwtParser(secret), "access");
    }

    public static JwtLocalValidationResult validateRefreshToken(String token, String secret) {
        return validateToken(token, getJwtParser(secret), "refresh");
    }

    public static SecretKey getSecretKey(String secret) {
        String effectiveSecret = normalizeSecret(secret);
        return SECRET_KEY_CACHE.computeIfAbsent(effectiveSecret, JwtLocalTokenValidator::buildSecretKey);
    }

    private static JwtParser getJwtParser(String secret) {
        String effectiveSecret = normalizeSecret(secret);
        return JWT_PARSER_CACHE.computeIfAbsent(effectiveSecret,
                key -> Jwts.parser().verifyWith(getSecretKey(key)).build());
    }

    private static SecretKey buildSecretKey(String secret) {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length >= HMAC_KEY_SIZE_BYTES) {
            return Keys.hmacShaKeyFor(keyBytes);
        }
        byte[] padded = new byte[HMAC_KEY_SIZE_BYTES];
        if (keyBytes.length == 0) {
            return Keys.hmacShaKeyFor(padded);
        }
        for (int i = 0; i < padded.length; i++) {
            padded[i] = keyBytes[i % keyBytes.length];
        }
        return Keys.hmacShaKeyFor(padded);
    }

    private static String normalizeSecret(String secret) {
        return secret == null ? "" : secret;
    }

    private static JwtLocalValidationResult validateToken(String token, JwtParser jwtParser, String expectedType) {
        String normalized = normalizeBearer(token);
        if (normalized == null || normalized.isBlank()) {
            return invalid();
        }
        try {
            Claims claims = jwtParser.parseSignedClaims(normalized)
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

    @Configuration(proxyBeanMethods = false)
    public static class JwtBeanConfiguration {

        @Bean(name = ACCESS_SECRET_KEY_BEAN_NAME)
        SecretKey jwtAccessSecretKey(@Value("${jwt.secret}") String secret) {
            return getSecretKey(secret);
        }

        @Bean(name = ACCESS_JWT_PARSER_BEAN_NAME)
        JwtParser jwtAccessJwtParser(@Qualifier(ACCESS_SECRET_KEY_BEAN_NAME) SecretKey secretKey) {
            return Jwts.parser().verifyWith(secretKey).build();
        }
    }
}
