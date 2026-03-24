package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.TokenPairDTO;
import com.im.dto.TokenParseResultDTO;
import com.im.dto.WsTicketDTO;
import com.im.dto.request.ParseTokenRequest;
import com.im.dto.request.RefreshTokenRequest;
import com.im.service.AuthTokenService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock
    private AuthTokenService authTokenService;

    @InjectMocks
    private AuthController authController;

    @Test
    void refresh_Success() {
        RefreshTokenRequest request = new RefreshTokenRequest();
        TokenPairDTO pair = new TokenPairDTO();
        pair.setAccessToken("new_access");
        
        when(authTokenService.refresh(any())).thenReturn(pair);
        
        ApiResponse<TokenPairDTO> response = authController.refresh(request);
        
        assertEquals(200, response.getCode());
        assertEquals("new_access", response.getData().getAccessToken());
    }

    @Test
    void parse_Success() {
        ParseTokenRequest request = new ParseTokenRequest();
        request.setToken("token");
        request.setAllowExpired(true);
        
        TokenParseResultDTO result = new TokenParseResultDTO();
        result.setValid(true);
        
        when(authTokenService.parseAccessToken(eq("token"), eq(true))).thenReturn(result);
        
        ApiResponse<TokenParseResultDTO> response = authController.parse(request);
        
        assertEquals(200, response.getCode());
        assertEquals(true, response.getData().isValid());
    }

    @Test
    void issueWsTicket_Success() {
        TokenParseResultDTO parseResult = new TokenParseResultDTO();
        parseResult.setValid(true);
        parseResult.setExpired(false);
        parseResult.setUserId(1L);
        parseResult.setUsername("alice");

        WsTicketDTO dto = new WsTicketDTO();
        dto.setTicket("ticket-1");
        dto.setExpiresInMs(30000L);

        when(authTokenService.parseAccessToken("Bearer token", false)).thenReturn(parseResult);
        when(authTokenService.issueWsTicket(1L, "alice")).thenReturn(dto);

        ApiResponse<WsTicketDTO> response = authController.issueWsTicket("Bearer token");

        assertEquals(200, response.getCode());
        assertEquals("ticket-1", response.getData().getTicket());
    }

    @Test
    void issueWsTicket_InvalidToken_ShouldThrowSecurityException() {
        TokenParseResultDTO parseResult = new TokenParseResultDTO();
        parseResult.setValid(false);

        when(authTokenService.parseAccessToken("Bearer bad", false)).thenReturn(parseResult);

        assertThrows(SecurityException.class, () -> authController.issueWsTicket("Bearer bad"));
    }
}
