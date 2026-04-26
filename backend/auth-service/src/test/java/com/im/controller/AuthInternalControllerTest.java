package com.im.controller;

import com.im.dto.*;
import com.im.dto.request.ConsumeWsTicketRequest;
import com.im.dto.request.IssueTokenRequest;
import com.im.exception.AuthServiceException;
import com.im.service.AuthPermissionService;
import com.im.service.AuthTokenRevokeService;
import com.im.service.AuthTokenService;
import com.im.service.AuthUserResourceService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthInternalControllerTest {

    @Mock
    private AuthTokenService authTokenService;

    @Mock
    private AuthUserResourceService authUserResourceService;

    @Mock
    private AuthPermissionService authPermissionService;

    @Mock
    private AuthTokenRevokeService authTokenRevokeService;

    @Mock
    private HttpServletRequest httpRequest;

    @InjectMocks
    private AuthInternalController controller;

    @BeforeEach
    void setUp() {
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "tokenRevocationCheckEnabled", true);
    }

    @Test
    void issueToken_Success() {
        IssueTokenRequest request = new IssueTokenRequest();
        request.setUserId(1L);
        request.setUsername("user");

        TokenPairDTO pair = new TokenPairDTO();
        pair.setAccessToken("token");
        when(authTokenService.issueTokenPair(1L, "user")).thenReturn(pair);

        ApiResponse<TokenPairDTO> result = controller.issueToken(httpRequest, request);

        assertEquals("token", result.getData().getAccessToken());
        verify(authUserResourceService).upsertFromIssueTokenRequest(request);
    }

    @Test
    void validateToken_ValidAndNotRevoked() {
        TokenParseResultDTO parseResult = new TokenParseResultDTO();
        parseResult.setValid(true);
        parseResult.setExpired(false);

        when(authTokenService.parseAccessToken("token", false)).thenReturn(parseResult);
        when(authTokenRevokeService.isTokenRevoked(eq("token"), any(TokenParseResultDTO.class))).thenReturn(false);

        ApiResponse<TokenParseResultDTO> result = controller.validateToken(httpRequest, null, "token");

        assertEquals(true, result.getData().isValid());
    }

    @Test
    void validateToken_Revoked() {
        TokenParseResultDTO parseResult = new TokenParseResultDTO();
        parseResult.setValid(true);
        parseResult.setExpired(false);

        when(authTokenService.parseAccessToken("token", false)).thenReturn(parseResult);
        when(authTokenRevokeService.isTokenRevoked(eq("token"), any(TokenParseResultDTO.class))).thenReturn(true);

        AuthServiceException exception = assertThrows(AuthServiceException.class,
                () -> controller.validateToken(httpRequest, null, "token"));
        assertNotNull(exception.getErrorCode());
        assertEquals("TOKEN_INVALID", exception.getErrorCode().getMessage());
    }

    @Test
    void introspect_ValidToken_ShouldReturnGatewayIdentityData() {
        TokenParseResultDTO parseResult = new TokenParseResultDTO();
        parseResult.setValid(true);
        parseResult.setExpired(false);
        parseResult.setUserId(1L);
        parseResult.setUsername("token-user");
        parseResult.setIssuedAtEpochMs(100L);
        parseResult.setExpiresAtEpochMs(100_000L);
        parseResult.setJti("jti-1");

        AuthUserResourceDTO resource = new AuthUserResourceDTO();
        resource.setUserId(1L);
        resource.setUsername("resource-user");
        resource.setUserInfo(Map.of("nickname", "neo"));
        resource.setResourcePermissions(List.of("message:read"));
        resource.setDataScopes(Map.of("tenantId", 1));

        when(authTokenService.parseAccessToken("token", false)).thenReturn(parseResult);
        when(authTokenRevokeService.isTokenRevoked(eq("token"), any(TokenParseResultDTO.class))).thenReturn(false);
        when(authUserResourceService.getOrLoad(1L)).thenReturn(resource);

        ApiResponse<AuthIntrospectResultDTO> result = controller.introspect(httpRequest, null, "Bearer token");

        assertTrue(result.getData().isValid());
        assertFalse(result.getData().isExpired());
        assertEquals(1L, result.getData().getUserId());
        assertEquals("resource-user", result.getData().getUsername());
        assertEquals(100_000L, result.getData().getExpiresAtEpochMs());
        assertEquals(List.of("message:read"), result.getData().getResourcePermissions());
    }

    @Test
    void introspect_RevokedToken_ShouldReject() {
        TokenParseResultDTO parseResult = new TokenParseResultDTO();
        parseResult.setValid(true);
        parseResult.setExpired(false);
        parseResult.setUserId(1L);

        when(authTokenService.parseAccessToken("token", false)).thenReturn(parseResult);
        when(authTokenRevokeService.isTokenRevoked(eq("token"), any(TokenParseResultDTO.class))).thenReturn(true);

        AuthServiceException exception = assertThrows(AuthServiceException.class,
                () -> controller.introspect(httpRequest, null, "token"));
        assertNotNull(exception.getErrorCode());
        assertEquals("TOKEN_INVALID", exception.getErrorCode().getMessage());
    }

    @Test
    void consumeWsTicket_ShouldVerifyAndDelegate() {
        ConsumeWsTicketRequest request = new ConsumeWsTicketRequest();
        request.setTicket("ticket-1");
        request.setUserId(1L);

        WsTicketConsumeResultDTO dto = WsTicketConsumeResultDTO.builder()
                .valid(true)
                .status(WsTicketConsumeResultDTO.STATUS_VALID)
                .userId(99L)
                .username("authoritative-user")
                .build();
        when(authTokenService.consumeWsTicket("ticket-1", 1L)).thenReturn(dto);

        ApiResponse<WsTicketConsumeResultDTO> result = controller.consumeWsTicket(httpRequest, request);

        assertEquals(true, result.getData().isValid());
        assertEquals(WsTicketConsumeResultDTO.STATUS_VALID, result.getData().getStatus());
        assertEquals(99L, result.getData().getUserId());
        assertEquals("authoritative-user", result.getData().getUsername());
        verify(authTokenService).consumeWsTicket("ticket-1", 1L);
    }
}
