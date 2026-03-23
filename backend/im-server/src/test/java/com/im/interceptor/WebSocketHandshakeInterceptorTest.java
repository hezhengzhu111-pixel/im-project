package com.im.interceptor;

import com.im.dto.TokenParseResultDTO;
import com.im.feign.AuthServiceFeignClient;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.socket.WebSocketHandler;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WebSocketHandshakeInterceptorTest {

    @Mock
    private AuthServiceFeignClient authServiceFeignClient;

    @InjectMocks
    private WebSocketHandshakeInterceptor interceptor;

    @Mock
    private ServletServerHttpRequest serverHttpRequest;

    @Mock
    private HttpServletRequest httpServletRequest;

    @Mock
    private ServerHttpResponse serverHttpResponse;

    @Mock
    private WebSocketHandler webSocketHandler;

    private Map<String, Object> attributes;
    private HttpHeaders httpHeaders;

    @BeforeEach
    void setUp() {
        attributes = new HashMap<>();
        httpHeaders = new HttpHeaders();
    }

    @Test
    void beforeHandshake_NotServletRequest_ShouldReturnFalse() throws Exception {
        org.springframework.http.server.ServerHttpRequest nonServletRequest = mock(org.springframework.http.server.ServerHttpRequest.class);
        boolean result = interceptor.beforeHandshake(nonServletRequest, serverHttpResponse, webSocketHandler, attributes);
        assertFalse(result);
    }

    @Test
    void beforeHandshake_NoToken_ShouldReturnFalseAndUnauthorized() throws Exception {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("token")).thenReturn(null);
        when(httpServletRequest.getHeader("Sec-WebSocket-Protocol")).thenReturn(null);
        when(httpServletRequest.getHeader("Authorization")).thenReturn(null);

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void beforeHandshake_InvalidToken_ShouldReturnFalseAndUnauthorized() throws Exception {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("token")).thenReturn("invalid_token");
        
        TokenParseResultDTO invalidResult = new TokenParseResultDTO();
        invalidResult.setValid(false);
        when(authServiceFeignClient.validateToken("invalid_token")).thenReturn(invalidResult);

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void beforeHandshake_ExpiredToken_ShouldReturnFalseAndUnauthorized() throws Exception {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("token")).thenReturn("expired_token");

        TokenParseResultDTO expiredResult = new TokenParseResultDTO();
        expiredResult.setValid(true);
        expiredResult.setExpired(true);
        when(authServiceFeignClient.validateToken("expired_token")).thenReturn(expiredResult);

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void beforeHandshake_TokenValidationThrowsException_ShouldReturnFalseAndUnauthorized() throws Exception {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("token")).thenReturn("error_token");

        when(authServiceFeignClient.validateToken("error_token")).thenThrow(new RuntimeException("Feign error"));

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void beforeHandshake_TokenValidButNoUserId_ShouldReturnFalseAndForbidden() throws Exception {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("token")).thenReturn("valid_token");
        when(httpServletRequest.getRequestURI()).thenReturn("/ws/123");

        TokenParseResultDTO validResult = new TokenParseResultDTO();
        validResult.setValid(true);
        validResult.setExpired(false);
        validResult.setUserId(null);
        when(authServiceFeignClient.validateToken("valid_token")).thenReturn(validResult);

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.FORBIDDEN);
    }

    @Test
    void beforeHandshake_UserIdMismatch_ShouldReturnFalseAndForbidden() throws Exception {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("token")).thenReturn("valid_token");
        when(httpServletRequest.getRequestURI()).thenReturn("/ws/123");

        TokenParseResultDTO validResult = new TokenParseResultDTO();
        validResult.setValid(true);
        validResult.setExpired(false);
        validResult.setUserId(456L); // Mismatch
        when(authServiceFeignClient.validateToken("valid_token")).thenReturn(validResult);

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.FORBIDDEN);
    }

    @Test
    void beforeHandshake_Success_FromParam_ShouldReturnTrueAndSetAttribute() throws Exception {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("token")).thenReturn("valid_token");
        when(httpServletRequest.getRequestURI()).thenReturn("/ws/123");

        TokenParseResultDTO validResult = new TokenParseResultDTO();
        validResult.setValid(true);
        validResult.setExpired(false);
        validResult.setUserId(123L);
        when(authServiceFeignClient.validateToken("valid_token")).thenReturn(validResult);

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertTrue(result);
        assertEquals("123", attributes.get("userId"));
    }

    @Test
    void beforeHandshake_Success_FromProtocol_ShouldReturnTrueAndSetHeader() throws Exception {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("token")).thenReturn(null);
        when(httpServletRequest.getHeader("Sec-WebSocket-Protocol")).thenReturn("valid_token");
        when(httpServletRequest.getRequestURI()).thenReturn("/ws/123?otherParam=1");
        
        when(serverHttpResponse.getHeaders()).thenReturn(httpHeaders);

        TokenParseResultDTO validResult = new TokenParseResultDTO();
        validResult.setValid(true);
        validResult.setExpired(false);
        validResult.setUserId(123L);
        when(authServiceFeignClient.validateToken("valid_token")).thenReturn(validResult);

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertTrue(result);
        assertEquals("123", attributes.get("userId"));
        assertEquals("valid_token", httpHeaders.getFirst("Sec-WebSocket-Protocol"));
    }

    @Test
    void beforeHandshake_Success_FromAuthHeader_ShouldReturnTrue() throws Exception {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("token")).thenReturn(null);
        when(httpServletRequest.getHeader("Sec-WebSocket-Protocol")).thenReturn(null);
        when(httpServletRequest.getHeader("Authorization")).thenReturn("Bearer valid_token");
        when(httpServletRequest.getRequestURI()).thenReturn("/ws/123");

        TokenParseResultDTO validResult = new TokenParseResultDTO();
        validResult.setValid(true);
        validResult.setExpired(false);
        validResult.setUserId(123L);
        when(authServiceFeignClient.validateToken("valid_token")).thenReturn(validResult);

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertTrue(result);
        assertEquals("123", attributes.get("userId"));
    }
}
