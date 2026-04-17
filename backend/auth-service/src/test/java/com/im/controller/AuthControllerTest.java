package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.TokenPairDTO;
import com.im.dto.TokenParseResultDTO;
import com.im.dto.WsTicketDTO;
import com.im.dto.request.ParseTokenRequest;
import com.im.dto.request.RefreshTokenRequest;
import com.im.service.AuthTokenService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock
    private AuthTokenService authTokenService;

    @InjectMocks
    private AuthController authController;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(authController, "accessTokenCookieName", "IM_ACCESS_TOKEN");
        ReflectionTestUtils.setField(authController, "refreshTokenCookieName", "IM_REFRESH_TOKEN");
        ReflectionTestUtils.setField(authController, "authCookieSameSite", "Lax");
        ReflectionTestUtils.setField(authController, "authCookieSecure", "never");
        ReflectionTestUtils.setField(authController, "wsTicketCookieName", "IM_WS_TICKET");
        ReflectionTestUtils.setField(authController, "wsTicketCookiePath", "/websocket");
        ReflectionTestUtils.setField(authController, "wsTicketCookieSameSite", "Strict");
        ReflectionTestUtils.setField(authController, "wsTicketCookieSecure", "never");
    }

    @Test
    void refresh_Success() {
        RefreshTokenRequest request = new RefreshTokenRequest();
        TokenPairDTO pair = new TokenPairDTO();
        pair.setAccessToken("new_access");
        pair.setRefreshToken("new_refresh");
        pair.setExpiresInMs(60000L);
        pair.setRefreshExpiresInMs(120000L);

        when(authTokenService.refresh(any())).thenReturn(pair);

        MockHttpServletRequest httpRequest = new MockHttpServletRequest();
        MockHttpServletResponse httpResponse = new MockHttpServletResponse();
        ApiResponse<TokenPairDTO> response = authController.refresh(request, httpRequest, httpResponse);

        assertEquals(200, response.getCode());
        assertEquals("new_access", response.getData().getAccessToken());
        assertEquals(60000L, response.getData().getExpiresInMs());
        assertEquals(null, response.getData().getRefreshToken());
    }

    @Test
    void parse_Success() {
        ParseTokenRequest request = new ParseTokenRequest();
        request.setToken("token");
        request.setAllowExpired(true);
        
        TokenParseResultDTO result = new TokenParseResultDTO();
        result.setValid(true);

        when(authTokenService.parseAccessToken(eq("token"), eq(true))).thenReturn(result);

        ApiResponse<TokenParseResultDTO> response = authController.parse(request, new MockHttpServletRequest());

        assertEquals(200, response.getCode());
        assertEquals(true, response.getData().isValid());
    }

    @Test
    void issueWsTicket_Success() {
        WsTicketDTO dto = new WsTicketDTO();
        dto.setTicket("ticket-1");
        dto.setExpiresInMs(30000L);

        when(authTokenService.issueWsTicket(1L, "alice")).thenReturn(dto);

        MockHttpServletRequest httpRequest = new MockHttpServletRequest();
        MockHttpServletResponse httpResponse = new MockHttpServletResponse();
        ApiResponse<WsTicketDTO> response = authController.issueWsTicket(1L, "alice", httpRequest, httpResponse);

        assertEquals(200, response.getCode());
        assertEquals("ticket-1", response.getData().getTicket());
        String setCookie = httpResponse.getHeader(HttpHeaders.SET_COOKIE);
        assertNotNull(setCookie);
        assertTrue(setCookie.contains("IM_WS_TICKET=ticket-1"));
        assertTrue(setCookie.contains("Path=/websocket"));
        assertTrue(setCookie.contains("Max-Age=30"));
        assertTrue(setCookie.contains("HttpOnly"));
        assertTrue(setCookie.contains("SameSite=Strict"));
        assertTrue(!setCookie.contains("Secure"));
    }

    @Test
    void issueWsTicket_ShouldIncludeSecureFlagWhenConfigured() {
        WsTicketDTO dto = new WsTicketDTO();
        dto.setTicket("ticket-2");
        dto.setExpiresInMs(30000L);
        when(authTokenService.issueWsTicket(1L, "alice")).thenReturn(dto);
        ReflectionTestUtils.setField(authController, "wsTicketCookieSecure", "true");

        MockHttpServletResponse httpResponse = new MockHttpServletResponse();
        authController.issueWsTicket(1L, "alice", new MockHttpServletRequest(), httpResponse);

        String setCookie = httpResponse.getHeader(HttpHeaders.SET_COOKIE);
        assertNotNull(setCookie);
        assertTrue(setCookie.contains("Secure"));
    }

    @Test
    void issueWsTicket_InvalidToken_ShouldThrowSecurityException() {
        when(authTokenService.issueWsTicket(1L, "alice")).thenThrow(new SecurityException("invalid"));

        assertThrows(SecurityException.class, () -> authController.issueWsTicket(
                1L,
                "alice",
                new MockHttpServletRequest(),
                new MockHttpServletResponse()
        ));
    }

    @Test
    void issueWsTicket_MissingIdentity_ShouldThrowSecurityException() {
        assertThrows(SecurityException.class, () -> authController.issueWsTicket(
                null,
                " ",
                new MockHttpServletRequest(),
                new MockHttpServletResponse()
        ));
    }
}
