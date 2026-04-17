package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.JwtLocalValidationResult;
import com.im.dto.TokenPairDTO;
import com.im.service.AuthTokenService;
import com.im.service.AuthUserResourceService;
import com.im.util.JwtLocalTokenValidator;
import com.im.util.TokenParser;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

class AuthControllerRefreshFlowTest {

    private static final String ACCESS_SECRET = "im-access-secret-im-access-secret-im-access-secret-im-access-secret";
    private static final String REFRESH_SECRET = "im-refresh-secret-im-refresh-secret-im-refresh-secret-im-refresh-secret";

    @Test
    void refreshShouldReturnNewAccessTokenThatPassesLocalJwtValidation() {
        ControllerFixture fixture = new ControllerFixture();
        TokenPairDTO initialPair = fixture.authTokenService.issueTokenPair(4001L, "refresh-user");

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new jakarta.servlet.http.Cookie("IM_REFRESH_TOKEN", initialPair.getRefreshToken()));
        MockHttpServletResponse response = new MockHttpServletResponse();

        ApiResponse<TokenPairDTO> refreshResult = fixture.authController.refresh(null, request, response);

        assertEquals(200, refreshResult.getCode());
        assertNotNull(refreshResult.getData());
        assertNotNull(refreshResult.getData().getAccessToken());
        JwtLocalValidationResult validationResult = JwtLocalTokenValidator.validateAccessToken(
                refreshResult.getData().getAccessToken(),
                ACCESS_SECRET
        );
        assertTrue(validationResult.isValid());
        assertEquals(4001L, validationResult.userId());
        assertEquals("refresh-user", validationResult.username());
    }

    private static final class ControllerFixture {
        private final Map<String, String> redisValues = new ConcurrentHashMap<>();
        private final AuthTokenService authTokenService;
        private final AuthController authController;

        private ControllerFixture() {
            StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
            @SuppressWarnings("unchecked")
            ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
            AuthUserResourceService authUserResourceService = mock(AuthUserResourceService.class);
            TokenParser tokenParser = new TokenParser();
            ReflectionTestUtils.setField(tokenParser, "accessSecret", ACCESS_SECRET);
            ReflectionTestUtils.setField(tokenParser, "refreshSecret", REFRESH_SECRET);

            when(redisTemplate.opsForValue()).thenReturn(valueOperations);
            when(authUserResourceService.getOrLoad(anyLong())).thenAnswer(invocation -> {
                com.im.dto.AuthUserResourceDTO dto = new com.im.dto.AuthUserResourceDTO();
                dto.setUserId(invocation.getArgument(0));
                dto.setUsername("refresh-user");
                dto.setUserInfo(Map.of("nickname", "refresh-user"));
                dto.setResourcePermissions(List.of("message:read"));
                dto.setDataScopes(Map.of("tenantId", 1));
                return dto;
            });
            doAnswer(invocation -> {
                redisValues.put(invocation.getArgument(0), invocation.getArgument(1));
                return null;
            }).when(valueOperations).set(any(String.class), any(String.class), any(Duration.class));
            when(valueOperations.get(any(String.class))).thenAnswer(invocation -> redisValues.get(invocation.getArgument(0)));
            when(valueOperations.setIfAbsent(any(String.class), any(String.class), any(Duration.class)))
                    .thenAnswer(invocation -> redisValues.putIfAbsent(invocation.getArgument(0), invocation.getArgument(1)) == null);
            when(redisTemplate.execute(any(), any(List.class), any(String.class), any(String.class), any(String.class), any(String.class)))
                    .thenAnswer(invocation -> {
                        @SuppressWarnings("unchecked")
                        List<String> keys = invocation.getArgument(1);
                        redisValues.put(keys.get(0), invocation.getArgument(2));
                        redisValues.put(keys.get(1), invocation.getArgument(4));
                        return 1L;
                    });
            when(redisTemplate.execute(any(), any(List.class), any(String.class)))
                    .thenAnswer(invocation -> {
                        @SuppressWarnings("unchecked")
                        List<String> keys = invocation.getArgument(1);
                        String key = keys.get(0);
                        String expectedOwner = invocation.getArgument(2);
                        if (expectedOwner.equals(redisValues.get(key))) {
                            redisValues.remove(key);
                            return 1L;
                        }
                        return 0L;
                    });

            this.authTokenService = new AuthTokenService(redisTemplate, authUserResourceService, tokenParser);
            ReflectionTestUtils.setField(authTokenService, "accessSecret", ACCESS_SECRET);
            ReflectionTestUtils.setField(authTokenService, "refreshSecret", REFRESH_SECRET);
            ReflectionTestUtils.setField(authTokenService, "accessExpirationMs", 60_000L);
            ReflectionTestUtils.setField(authTokenService, "refreshExpirationMs", 120_000L);
            ReflectionTestUtils.setField(authTokenService, "previousRefreshGraceSeconds", 5L);
            ReflectionTestUtils.setField(authTokenService, "refreshLockSeconds", 5L);

            this.authController = new AuthController(authTokenService);
            ReflectionTestUtils.setField(authController, "accessTokenCookieName", "IM_ACCESS_TOKEN");
            ReflectionTestUtils.setField(authController, "refreshTokenCookieName", "IM_REFRESH_TOKEN");
            ReflectionTestUtils.setField(authController, "authCookieSameSite", "Lax");
            ReflectionTestUtils.setField(authController, "authCookieSecure", "never");
            ReflectionTestUtils.setField(authController, "wsTicketCookieName", "IM_WS_TICKET");
            ReflectionTestUtils.setField(authController, "wsTicketCookiePath", "/websocket");
            ReflectionTestUtils.setField(authController, "wsTicketCookieSameSite", "Strict");
            ReflectionTestUtils.setField(authController, "wsTicketCookieSecure", "never");
        }
    }
}
