package com.im.interceptor;

import com.im.dto.WsTicketConsumeResultDTO;
import com.im.dto.request.ConsumeWsTicketRequest;
import com.im.feign.AuthServiceFeignClient;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.socket.WebSocketHandler;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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

    @BeforeEach
    void setUp() {
        attributes = new HashMap<>();
    }

    @Test
    void beforeHandshake_NotServletRequest_ShouldReturnFalse() {
        org.springframework.http.server.ServerHttpRequest nonServletRequest = mock(org.springframework.http.server.ServerHttpRequest.class);
        boolean result = interceptor.beforeHandshake(nonServletRequest, serverHttpResponse, webSocketHandler, attributes);
        assertFalse(result);
    }

    @Test
    void beforeHandshake_NoTicket_ShouldReturnFalseAndUnauthorized() {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("ticket")).thenReturn(null);

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void beforeHandshake_InvalidUserIdPath_ShouldReturnBadRequest() {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("ticket")).thenReturn("ticket-1");
        when(httpServletRequest.getRequestURI()).thenReturn("/websocket/not-a-number");

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.BAD_REQUEST);
    }

    @Test
    void beforeHandshake_InvalidTicket_ShouldReturnUnauthorized() {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("ticket")).thenReturn("ticket-1");
        when(httpServletRequest.getRequestURI()).thenReturn("/websocket/123");
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(false)
                .error("ticket无效或已过期")
                .build());

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void beforeHandshake_UserIdMismatch_ShouldReturnForbidden() {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("ticket")).thenReturn("ticket-1");
        when(httpServletRequest.getRequestURI()).thenReturn("/websocket/123");
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(false)
                .userId(456L)
                .error("ticket与userId不匹配")
                .build());

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.FORBIDDEN);
    }

    @Test
    void beforeHandshake_Success_ShouldConsumeTicketAndSetAttribute() {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("ticket")).thenReturn("ticket-1");
        when(httpServletRequest.getRequestURI()).thenReturn("/websocket/123");
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(true)
                .userId(123L)
                .username("alice")
                .build());

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertTrue(result);
        assertEquals("123", attributes.get("userId"));

        ArgumentCaptor<ConsumeWsTicketRequest> captor = ArgumentCaptor.forClass(ConsumeWsTicketRequest.class);
        verify(authServiceFeignClient).consumeWsTicket(captor.capture());
        assertEquals("ticket-1", captor.getValue().getTicket());
        assertEquals(123L, captor.getValue().getUserId());
    }

    private static org.springframework.http.server.ServerHttpRequest mock(Class<org.springframework.http.server.ServerHttpRequest> clazz) {
        return org.mockito.Mockito.mock(clazz);
    }
}
