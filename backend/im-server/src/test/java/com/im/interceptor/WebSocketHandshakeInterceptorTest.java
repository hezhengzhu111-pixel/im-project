package com.im.interceptor;

import com.im.dto.WsTicketConsumeResultDTO;
import com.im.dto.request.ConsumeWsTicketRequest;
import com.im.feign.AuthServiceFeignClient;
import com.im.metrics.ImServerMetrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.WebSocketHandler;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
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
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        attributes = new HashMap<>();
        meterRegistry = new SimpleMeterRegistry();
        ReflectionTestUtils.setField(interceptor, "metrics", new ImServerMetrics(meterRegistry));
        ReflectionTestUtils.setField(interceptor, "wsTicketCookieName", "IM_WS_TICKET");
        ReflectionTestUtils.setField(interceptor, "wsTicketCookiePath", "/websocket");
        ReflectionTestUtils.setField(interceptor, "authCookieSameSite", "Lax");
        ReflectionTestUtils.setField(interceptor, "authCookieSecure", "never");
        ReflectionTestUtils.setField(
                interceptor,
                "allowedOrigins",
                "http://localhost,http://127.0.0.1,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080"
        );
    }

    @Test
    void beforeHandshake_NotServletRequest_ShouldReturnFalse() {
        org.springframework.http.server.ServerHttpRequest nonServletRequest = mock(org.springframework.http.server.ServerHttpRequest.class);
        boolean result = interceptor.beforeHandshake(nonServletRequest, serverHttpResponse, webSocketHandler, attributes);
        assertFalse(result);
        assertEquals(1.0, handshakeCount("failure", "unsupported_request"));
    }

    @Test
    void beforeHandshake_NoTicket_ShouldReturnFalseAndUnauthorized() {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("ticket")).thenReturn(null);

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
        assertEquals(1.0, handshakeCount("failure", "missing_ticket"));
    }

    @Test
    void beforeHandshake_InvalidUserIdPath_ShouldReturnBadRequest() {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getParameter("ticket")).thenReturn("ticket-1");
        when(httpServletRequest.getRequestURI()).thenReturn("/websocket/not-a-number");

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.BAD_REQUEST);
        assertEquals(1.0, handshakeCount("failure", "invalid_user"));
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
        assertEquals(1.0, handshakeCount("failure", "ticket_invalid"));
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
        assertEquals(1.0, handshakeCount("failure", "ticket_mismatch"));
    }

    @Test
    void beforeHandshake_CookieTicketSuccess_ShouldConsumeTicketAndClearCookie() {
        HttpHeaders headers = new HttpHeaders();
        when(serverHttpResponse.getHeaders()).thenReturn(headers);
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getCookies()).thenReturn(new Cookie[]{
                new Cookie("IM_WS_TICKET", "cookie-ticket")
        });
        when(httpServletRequest.getRequestURI()).thenReturn("/websocket/123");
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(true)
                .userId(123L)
                .username("alice")
                .build());

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertTrue(result);
        assertEquals("123", attributes.get("userId"));
        verify(httpServletRequest, never()).getParameter("ticket");

        ArgumentCaptor<ConsumeWsTicketRequest> captor = ArgumentCaptor.forClass(ConsumeWsTicketRequest.class);
        verify(authServiceFeignClient).consumeWsTicket(captor.capture());
        assertEquals("cookie-ticket", captor.getValue().getTicket());
        assertEquals(123L, captor.getValue().getUserId());

        String setCookie = headers.getFirst(HttpHeaders.SET_COOKIE);
        assertTrue(setCookie.contains("IM_WS_TICKET="));
        assertTrue(setCookie.contains("Max-Age=0"));
        assertTrue(setCookie.contains("Path=/websocket"));
        assertEquals(1.0, handshakeCount("success", "success"));
    }

    @Test
    void beforeHandshake_QueryFallbackSuccess_ShouldConsumeTicketAndSetAttribute() {
        HttpHeaders headers = new HttpHeaders();
        when(serverHttpResponse.getHeaders()).thenReturn(headers);
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
        assertEquals(1.0, handshakeCount("success", "success"));
    }

    @Test
    void beforeHandshake_NonWhitelistOrigin_ShouldReturnForbiddenAndNotConsumeTicket() {
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getHeader(HttpHeaders.ORIGIN)).thenReturn("https://evil.example");

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.FORBIDDEN);
        verify(authServiceFeignClient, never()).consumeWsTicket(any());
        assertEquals(1.0, handshakeCount("failure", "origin_denied"));
    }

    @Test
    void beforeHandshake_LocalhostOriginWithoutPort_ShouldBeAllowed() {
        HttpHeaders headers = new HttpHeaders();
        when(serverHttpResponse.getHeaders()).thenReturn(headers);
        when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        when(httpServletRequest.getHeader(HttpHeaders.ORIGIN)).thenReturn("http://localhost");
        when(httpServletRequest.getParameter("ticket")).thenReturn("ticket-1");
        when(httpServletRequest.getRequestURI()).thenReturn("/websocket/123");
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(true)
                .userId(123L)
                .username("alice")
                .build());

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertTrue(result);
        verify(authServiceFeignClient).consumeWsTicket(any());
        assertEquals(1.0, handshakeCount("success", "success"));
    }

    private static org.springframework.http.server.ServerHttpRequest mock(Class<org.springframework.http.server.ServerHttpRequest> clazz) {
        return org.mockito.Mockito.mock(clazz);
    }

    private double handshakeCount(String result, String reason) {
        return meterRegistry.counter("im.websocket.handshake.total", "result", result, "reason", reason).count();
    }
}
