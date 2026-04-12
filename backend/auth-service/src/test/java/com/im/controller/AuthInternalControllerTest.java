package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.TokenPairDTO;
import com.im.dto.TokenParseResultDTO;
import com.im.dto.WsTicketConsumeResultDTO;
import com.im.dto.request.ConsumeWsTicketRequest;
import com.im.dto.request.IssueTokenRequest;
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
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
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
        ReflectionTestUtils.setField(controller, "internalSecret", "secret");
        ReflectionTestUtils.setField(controller, "internalHeader", "X-Internal-Secret");
        ReflectionTestUtils.setField(controller, "tokenRevocationCheckEnabled", true);
        
        when(httpRequest.getHeader("X-Internal-Secret")).thenReturn("secret");
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
        when(authTokenRevokeService.isTokenRevoked("token")).thenReturn(false);
        
        ApiResponse<TokenParseResultDTO> result = controller.validateToken(httpRequest, null, "token");
        
        assertEquals(true, result.getData().isValid());
    }

    @Test
    void validateToken_Revoked() {
        TokenParseResultDTO parseResult = new TokenParseResultDTO();
        parseResult.setValid(true);
        parseResult.setExpired(false);
        
        when(authTokenService.parseAccessToken("token", false)).thenReturn(parseResult);
        when(authTokenRevokeService.isTokenRevoked("token")).thenReturn(true);
        
        ApiResponse<TokenParseResultDTO> result = controller.validateToken(httpRequest, null, "token");
        
        assertFalse(result.getData().isValid());
        assertEquals("token已吊销", result.getData().getError());
    }
    @Test
    void consumeWsTicket_ShouldVerifyAndDelegate() {
        ConsumeWsTicketRequest request = new ConsumeWsTicketRequest();
        request.setTicket("ticket-1");
        request.setUserId(1L);

        WsTicketConsumeResultDTO dto = WsTicketConsumeResultDTO.builder()
                .valid(true)
                .userId(1L)
                .username("alice")
                .build();
        when(authTokenService.consumeWsTicket("ticket-1", 1L)).thenReturn(dto);

        ApiResponse<WsTicketConsumeResultDTO> result = controller.consumeWsTicket(httpRequest, request);

        assertEquals(true, result.getData().isValid());
        assertEquals(1L, result.getData().getUserId());
    }
}
