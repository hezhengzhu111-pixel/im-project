package com.im.service;

import com.im.dto.TokenPairDTO;
import com.im.dto.WsTicketConsumeResultDTO;
import com.im.dto.WsTicketDTO;
import com.im.dto.request.RefreshTokenRequest;
import com.im.util.TokenParser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthTokenServiceTest {

    @Mock
    private StringRedisTemplate stringRedisTemplate;
    @Mock
    private AuthUserResourceService authUserResourceService;
    @Mock
    private TokenParser tokenParser;
    @Mock
    private ValueOperations<String, String> valueOperations;

    private AuthTokenService service;

    @BeforeEach
    void setUp() {
        service = new AuthTokenService(stringRedisTemplate, authUserResourceService, tokenParser);
        ReflectionTestUtils.setField(service, "accessSecret", "access-secret-access-secret-access-secret-access-secret-2026");
        ReflectionTestUtils.setField(service, "refreshSecret", "refresh-secret-refresh-secret-refresh-secret-refresh-2026");
        ReflectionTestUtils.setField(service, "accessExpirationMs", 60000L);
        ReflectionTestUtils.setField(service, "refreshExpirationMs", 120000L);
        lenient().when(stringRedisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    @Test
    void refreshShouldIssueTokenPairWhenInputValid() {
        TokenParser.TokenParseInfo refreshInfo = validRefreshInfo(1001L, "alice", "jti-1");
        when(tokenParser.parseRefreshToken("refresh-token")).thenReturn(refreshInfo);
        when(valueOperations.get("auth:refresh:jti:1001")).thenReturn("jti-1");

        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("refresh-token");

        TokenPairDTO result = service.refresh(request);

        assertNotNull(result.getAccessToken());
        assertNotNull(result.getRefreshToken());
        assertEquals(60000L, result.getExpiresInMs());
        assertEquals(120000L, result.getRefreshExpiresInMs());
        verify(valueOperations).set(eq("auth:refresh:jti:1001"), anyString(), any(Duration.class));
        verify(authUserResourceService).getOrLoad(1001L);
    }

    @Test
    void refreshShouldRejectWhenStoredJtiMismatch() {
        TokenParser.TokenParseInfo refreshInfo = validRefreshInfo(1002L, "bob", "jti-current");
        when(tokenParser.parseRefreshToken("refresh-token")).thenReturn(refreshInfo);
        when(valueOperations.get("auth:refresh:jti:1002")).thenReturn("jti-old");

        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("refresh-token");

        SecurityException ex = assertThrows(SecurityException.class, () -> service.refresh(request));
        assertEquals("refreshToken已失效", ex.getMessage());
    }

    @Test
    void refreshShouldRejectWhenAccessTokenNotMatchRefreshToken() {
        TokenParser.TokenParseInfo refreshInfo = validRefreshInfo(1003L, "charlie", "jti-3");
        TokenParser.TokenParseInfo accessInfo = new TokenParser.TokenParseInfo();
        accessInfo.setUserId(9999L);
        when(tokenParser.parseRefreshToken("refresh-token")).thenReturn(refreshInfo);
        when(tokenParser.parseAccessToken("access-token")).thenReturn(accessInfo);
        when(valueOperations.get("auth:refresh:jti:1003")).thenReturn("jti-3");

        RefreshTokenRequest request = new RefreshTokenRequest();
        request.setRefreshToken("refresh-token");
        request.setAccessToken("access-token");

        SecurityException ex = assertThrows(SecurityException.class, () -> service.refresh(request));
        assertEquals("accessToken与refreshToken不匹配", ex.getMessage());
    }

    @Test
    void refreshShouldRejectWhenRequestInvalid() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.refresh(null));
        assertEquals("refreshToken不能为空", ex.getMessage());
    }

    private TokenParser.TokenParseInfo validRefreshInfo(Long userId, String username, String jti) {
        TokenParser.TokenParseInfo info = new TokenParser.TokenParseInfo();
        info.setValid(true);
        info.setExpired(false);
        info.setTokenType("refresh");
        info.setUserId(userId);
        info.setUsername(username);
        info.setJti(jti);
        return info;
    }
    @Test
    void issueWsTicket_ShouldPersistOneTimeTicket() {
        ReflectionTestUtils.setField(service, "wsTicketTtlSeconds", 30L);

        WsTicketDTO result = service.issueWsTicket(1004L, "dora");

        assertNotNull(result.getTicket());
        assertEquals(30000L, result.getExpiresInMs());
        verify(valueOperations).set(eq("auth:ws:ticket:" + result.getTicket()), eq("1004\ndora"), any(Duration.class));
    }

    @Test
    void consumeWsTicket_ShouldDeleteAndValidateTicket() {
        when(valueOperations.getAndDelete("auth:ws:ticket:ticket-1")).thenReturn("1005\nerin");

        WsTicketConsumeResultDTO result = service.consumeWsTicket("ticket-1", 1005L);

        assertTrue(result.isValid());
        assertEquals(1005L, result.getUserId());
        assertEquals("erin", result.getUsername());
    }

    @Test
    void consumeWsTicket_ShouldRejectUserMismatch() {
        when(valueOperations.getAndDelete("auth:ws:ticket:ticket-2")).thenReturn("1006\nfrank");

        WsTicketConsumeResultDTO result = service.consumeWsTicket("ticket-2", 2000L);

        assertEquals(false, result.isValid());
        assertEquals("ticket与userId不匹配", result.getError());
    }
}
