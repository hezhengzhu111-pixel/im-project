package com.im.util;

import com.im.dto.JwtLocalValidationResult;
import com.im.enums.JwtLocalValidationStatus;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.junit.jupiter.api.Test;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class JwtLocalTokenValidatorTest {

    private static final String ACCESS_SECRET = "im-access-secret-im-access-secret-im-access-secret-im-access-secret";
    private static final String OTHER_SECRET = "another-access-secret-another-access-secret-another-access-secret";

    @Test
    void validateAccessToken_shouldReturnValidForSignedToken() {
        JwtLocalValidationResult result = JwtLocalTokenValidator.validateAccessToken(
                buildToken(1001L, "neo", "access", ACCESS_SECRET, 60_000L, true),
                ACCESS_SECRET
        );

        assertEquals(JwtLocalValidationStatus.VALID, result.status());
        assertEquals(1001L, result.userId());
        assertEquals("neo", result.username());
        assertEquals("access", result.tokenType());
        assertNotNull(result.jti());
    }

    @Test
    void validateAccessToken_shouldReturnExpiredForExpiredToken() {
        JwtLocalValidationResult result = JwtLocalTokenValidator.validateAccessToken(
                buildToken(1002L, "trinity", "access", ACCESS_SECRET, -1_000L, true),
                ACCESS_SECRET
        );

        assertEquals(JwtLocalValidationStatus.EXPIRED, result.status());
        assertEquals(1002L, result.userId());
        assertEquals("trinity", result.username());
    }

    @Test
    void validateAccessToken_shouldReturnInvalidForSignatureMismatch() {
        JwtLocalValidationResult result = JwtLocalTokenValidator.validateAccessToken(
                buildToken(1003L, "morpheus", "access", OTHER_SECRET, 60_000L, true),
                ACCESS_SECRET
        );

        assertEquals(JwtLocalValidationStatus.INVALID_SIGNATURE_OR_MALFORMED, result.status());
    }

    @Test
    void validateAccessToken_shouldReturnMissingClaimsWhenTypMissing() {
        JwtLocalValidationResult result = JwtLocalTokenValidator.validateAccessToken(
                buildToken(1004L, "smith", null, ACCESS_SECRET, 60_000L, false),
                ACCESS_SECRET
        );

        assertEquals(JwtLocalValidationStatus.MISSING_REQUIRED_CLAIMS, result.status());
        assertEquals(1004L, result.userId());
        assertEquals("smith", result.username());
    }

    private String buildToken(Long userId,
                              String username,
                              String type,
                              String secret,
                              long expirationDeltaMs,
                              boolean includeJti) {
        Date now = new Date();
        Date exp = new Date(now.getTime() + expirationDeltaMs);
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", userId);
        claims.put("username", username);
        if (type != null) {
            claims.put("typ", type);
        }
        if (includeJti) {
            claims.put("jti", UUID.randomUUID().toString());
        }
        return Jwts.builder()
                .setClaims(claims)
                .setSubject(username)
                .setIssuedAt(now)
                .setExpiration(exp)
                .signWith(JwtLocalTokenValidator.getSecretKey(secret), SignatureAlgorithm.HS512)
                .compact();
    }
}
