package com.im.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.TokenParseResultDTO;
import com.im.enums.CommonErrorCode;
import com.im.exception.AuthExceptionHandler;
import com.im.exception.AuthServiceException;
import com.im.service.AuthTokenService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AuthErrorMappingTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private AuthTokenService authTokenService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AuthController authController = new AuthController(authTokenService);
        ReflectionTestUtils.setField(authController, "accessTokenCookieName", "IM_ACCESS_TOKEN");
        ReflectionTestUtils.setField(authController, "refreshTokenCookieName", "IM_REFRESH_TOKEN");
        ReflectionTestUtils.setField(authController, "authCookieSameSite", "Lax");
        ReflectionTestUtils.setField(authController, "authCookieSecure", "never");
        ReflectionTestUtils.setField(authController, "wsTicketCookieName", "IM_WS_TICKET");
        ReflectionTestUtils.setField(authController, "wsTicketCookiePath", "/websocket");
        ReflectionTestUtils.setField(authController, "wsTicketCookieSameSite", "Strict");
        ReflectionTestUtils.setField(authController, "wsTicketCookieSecure", "never");

        mockMvc = MockMvcBuilders.standaloneSetup(authController, new WsTicketErrorTestController())
                .setControllerAdvice(new AuthExceptionHandler())
                .build();
    }

    @Test
    void parseExpiredToken_shouldReturnTokenExpired() throws Exception {
        TokenParseResultDTO result = new TokenParseResultDTO();
        result.setValid(true);
        result.setExpired(true);
        when(authTokenService.parseAccessToken(eq("expired-token"), eq(false))).thenReturn(result);

        MvcResult mvcResult = mockMvc.perform(post("/parse")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(new ObjectMapper().writeValueAsString(java.util.Map.of("token", "expired-token"))))
                .andExpect(status().isUnauthorized())
                .andReturn();

        assertError(mvcResult, CommonErrorCode.TOKEN_EXPIRED);
    }

    @Test
    void parseInvalidToken_shouldReturnTokenInvalid() throws Exception {
        TokenParseResultDTO result = new TokenParseResultDTO();
        result.setValid(false);
        result.setExpired(false);
        when(authTokenService.parseAccessToken(eq("bad-token"), eq(false))).thenReturn(result);

        MvcResult mvcResult = mockMvc.perform(post("/parse")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(new ObjectMapper().writeValueAsString(java.util.Map.of("token", "bad-token"))))
                .andExpect(status().isUnauthorized())
                .andReturn();

        assertError(mvcResult, CommonErrorCode.TOKEN_INVALID);
    }

    @Test
    void refreshRejected_shouldReturnTokenExpired() throws Exception {
        when(authTokenService.refresh(any())).thenThrow(new SecurityException("refresh token expired"));

        MvcResult mvcResult = mockMvc.perform(post("/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized())
                .andReturn();

        assertError(mvcResult, CommonErrorCode.TOKEN_EXPIRED);
    }

    @Test
    void wsTicketInvalidOrExpired_shouldReturnUnifiedCode() throws Exception {
        MvcResult mvcResult = mockMvc.perform(post("/test/ws-ticket-invalid"))
                .andExpect(status().isUnauthorized())
                .andReturn();

        assertError(mvcResult, CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED);
    }

    private void assertError(MvcResult mvcResult, CommonErrorCode errorCode) throws Exception {
        Map<?, ?> body = objectMapper.readValue(mvcResult.getResponse().getContentAsByteArray(), Map.class);
        org.junit.jupiter.api.Assertions.assertEquals(errorCode.getCode(), body.get("code"));
        org.junit.jupiter.api.Assertions.assertEquals(errorCode.getMessage(), body.get("message"));
    }

    @RestController
    static class WsTicketErrorTestController {
        @PostMapping("/test/ws-ticket-invalid")
        public void invalid() {
            throw new AuthServiceException(CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED);
        }
    }
}
