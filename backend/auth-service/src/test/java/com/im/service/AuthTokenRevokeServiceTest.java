package com.im.service;

import com.im.dto.TokenParseResultDTO;
import com.im.dto.TokenRevokeResultDTO;
import com.im.dto.request.RevokeTokenRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthTokenRevokeServiceTest {

    @Mock
    private StringRedisTemplate stringRedisTemplate;
    @Mock
    private AuthTokenService authTokenService;
    @Mock
    private ValueOperations<String, String> valueOperations;
    @Mock
    private SetOperations<String, String> setOperations;

    private AuthTokenRevokeService service;

    @BeforeEach
    void setUp() {
        service = new AuthTokenRevokeService(stringRedisTemplate, authTokenService);
        ReflectionTestUtils.setField(service, "revokedTokenTtlSeconds", 86400L);
        when(stringRedisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    @Test
    void revokeTokenWritesTokenHash() {
        TokenParseResultDTO parsed = new TokenParseResultDTO();
        parsed.setUserId(7L);
        parsed.setTokenType("access");
        when(authTokenService.parseAccessToken("access-token", true)).thenReturn(parsed);
        when(stringRedisTemplate.hasKey("auth:revoked:token:" + sha256("access-token"))).thenReturn(false);
        when(stringRedisTemplate.opsForSet()).thenReturn(setOperations);

        RevokeTokenRequest request = new RevokeTokenRequest();
        request.setToken("access-token");
        request.setReason("logout");

        TokenRevokeResultDTO result = service.revokeToken(request);

        assertTrue(result.isSuccess());
        verify(valueOperations).set(eq("auth:revoked:token:" + sha256("access-token")), eq("1"), any(Duration.class));
        verify(setOperations).add("auth:revoked:user:7", sha256("access-token"));
    }

    @Test
    void revokeAllUserTokensWritesRevokeAfterAndDeletesRefreshState() {
        when(stringRedisTemplate.keys("auth:refresh:previous:8:*"))
                .thenReturn(Set.of("auth:refresh:previous:8:old"));

        service.revokeAllUserTokens(8L);

        verify(valueOperations).set(eq("auth:user:revoke_after:8"), any(String.class), any(Duration.class));
        verify(stringRedisTemplate).delete("auth:refresh:jti:8");
        verify(stringRedisTemplate).delete("auth:user:8");
        verify(stringRedisTemplate).delete(Set.of("auth:refresh:previous:8:old"));
        verify(stringRedisTemplate).delete("auth:revoked:user:8");
    }

    @Test
    void isTokenRevokedChecksHashAndUserRevokeAfter() {
        TokenParseResultDTO parsed = new TokenParseResultDTO();
        parsed.setUserId(9L);
        parsed.setIssuedAtEpochMs(1000L);
        when(stringRedisTemplate.hasKey("auth:revoked:token:" + sha256("access-token"))).thenReturn(false);
        when(valueOperations.get("auth:user:revoke_after:9")).thenReturn("1001");

        assertTrue(service.isTokenRevoked("access-token", parsed));
    }

    @Test
    void isUserTokenRevokedReturnsFalseWhenTokenIssuedAfterRevoke() {
        TokenParseResultDTO parsed = new TokenParseResultDTO();
        parsed.setUserId(10L);
        parsed.setIssuedAtEpochMs(2000L);
        when(valueOperations.get("auth:user:revoke_after:10")).thenReturn("1000");

        assertFalse(service.isUserTokenRevoked(parsed));
    }

    private static String sha256(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) {
                    result.append('0');
                }
                result.append(hex);
            }
            return result.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
