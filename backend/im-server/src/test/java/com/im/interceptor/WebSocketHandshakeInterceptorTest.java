package com.im.interceptor;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
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
import org.slf4j.LoggerFactory;
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
        ReflectionTestUtils.setField(interceptor, "wsTicketCookieSameSite", "Lax");
        ReflectionTestUtils.setField(interceptor, "wsTicketCookieSecure", "never");
        ReflectionTestUtils.setField(interceptor, "gatewayUserIdHeader", "X-User-Id");
        ReflectionTestUtils.setField(interceptor, "allowBlankOrigin", false);
        ReflectionTestUtils.setField(interceptor, "allowQueryTicket", false);
        ReflectionTestUtils.setField(
                interceptor,
                "allowedOrigins",
                "http://localhost,http://127.0.0.1,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080"
        );
        lenient().when(serverHttpRequest.getServletRequest()).thenReturn(httpServletRequest);
        lenient().when(httpServletRequest.getHeader(HttpHeaders.ORIGIN)).thenReturn("http://localhost");
        lenient().when(httpServletRequest.getHeader("X-User-Id")).thenReturn("123");
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
        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
        assertEquals(1.0, handshakeCount("failure", "missing_ticket"));
    }

    @Test
    void beforeHandshake_MissingTrustedUserHeader_ShouldReturnUnauthorized() {
        when(httpServletRequest.getHeader("X-User-Id")).thenReturn(null);
        when(httpServletRequest.getCookies()).thenReturn(new Cookie[]{
                new Cookie("IM_WS_TICKET", "cookie-ticket")
        });

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
        verify(authServiceFeignClient, never()).consumeWsTicket(any());
        assertEquals(1.0, handshakeCount("failure", "invalid_user"));
    }

    @Test
    void beforeHandshake_InvalidTicket_ShouldReturnUnauthorized() {
        when(httpServletRequest.getCookies()).thenReturn(new Cookie[]{
                new Cookie("IM_WS_TICKET", "cookie-ticket")
        });
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(false)
                .status(WsTicketConsumeResultDTO.STATUS_INVALID)
                .error("ticket鏃犳晥鎴栧凡杩囨湡")
                .build());

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
        assertEquals(1.0, handshakeCount("failure", "ticket_invalid"));
    }

    @Test
    void beforeHandshake_UserIdMismatch_ShouldReturnForbidden() {
        when(httpServletRequest.getCookies()).thenReturn(new Cookie[]{
                new Cookie("IM_WS_TICKET", "cookie-ticket")
        });
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(false)
                .status(WsTicketConsumeResultDTO.STATUS_USER_MISMATCH)
                .userId(456L)
                .username("mallory")
                .error("ticket与userId不匹配")
                .build());

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.FORBIDDEN);
        assertEquals(1.0, handshakeCount("failure", "ticket_mismatch"));
    }

    @Test
    void beforeHandshake_ForgedUrlUserIdShouldNotAffectFinalSessionUserId() {
        HttpHeaders headers = new HttpHeaders();
        when(serverHttpResponse.getHeaders()).thenReturn(headers);
        when(httpServletRequest.getCookies()).thenReturn(new Cookie[]{
                new Cookie("IM_WS_TICKET", "cookie-ticket")
        });
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(true)
                .status(WsTicketConsumeResultDTO.STATUS_VALID)
                .userId(123L)
                .username("alice")
                .build());

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertTrue(result);
        assertEquals("123", attributes.get("userId"));
        assertEquals("alice", attributes.get("username"));
        verify(httpServletRequest, never()).getParameter("ticket");

        ArgumentCaptor<ConsumeWsTicketRequest> captor = ArgumentCaptor.forClass(ConsumeWsTicketRequest.class);
        verify(authServiceFeignClient).consumeWsTicket(captor.capture());
        assertEquals("cookie-ticket", captor.getValue().getTicket());
        assertEquals(123L, captor.getValue().getUserId());

        String setCookie = headers.getFirst(HttpHeaders.SET_COOKIE);
        assertNotNull(setCookie);
        assertTrue(setCookie.contains("IM_WS_TICKET="));
        assertTrue(setCookie.contains("Max-Age=0"));
        assertTrue(setCookie.contains("Path=/websocket"));
        assertEquals(1.0, handshakeCount("success", "success"));
    }

    @Test
    void beforeHandshake_BlankOriginShouldBeRejectedByDefault() {
        when(httpServletRequest.getHeader(HttpHeaders.ORIGIN)).thenReturn(" ");

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.FORBIDDEN);
        verify(authServiceFeignClient, never()).consumeWsTicket(any());
        assertEquals(1.0, handshakeCount("failure", "origin_denied"));
    }

    @Test
    void beforeHandshake_BlankOriginShouldPassWhenExplicitlyAllowed() {
        HttpHeaders headers = new HttpHeaders();
        ReflectionTestUtils.setField(interceptor, "allowBlankOrigin", true);
        when(serverHttpResponse.getHeaders()).thenReturn(headers);
        when(httpServletRequest.getHeader(HttpHeaders.ORIGIN)).thenReturn(null);
        when(httpServletRequest.getCookies()).thenReturn(new Cookie[]{
                new Cookie("IM_WS_TICKET", "cookie-ticket")
        });
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(true)
                .status(WsTicketConsumeResultDTO.STATUS_VALID)
                .userId(123L)
                .username("alice")
                .build());

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertTrue(result);
        assertEquals("123", attributes.get("userId"));
        assertEquals("alice", attributes.get("username"));
    }

    @Test
    void beforeHandshake_QueryTicketShouldBeRejectedByDefault() {
        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
        verify(httpServletRequest, never()).getParameter("ticket");
        verify(authServiceFeignClient, never()).consumeWsTicket(any());
        assertEquals(1.0, handshakeCount("failure", "missing_ticket"));
    }

    @Test
    void beforeHandshake_QueryTicketShouldPassWhenExplicitlyAllowed() {
        HttpHeaders headers = new HttpHeaders();
        ReflectionTestUtils.setField(interceptor, "allowQueryTicket", true);
        when(serverHttpResponse.getHeaders()).thenReturn(headers);
        when(httpServletRequest.getParameter("ticket")).thenReturn("query-ticket");
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(true)
                .status(WsTicketConsumeResultDTO.STATUS_VALID)
                .userId(123L)
                .username("alice")
                .build());

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertTrue(result);
        assertEquals("123", attributes.get("userId"));
        assertEquals("alice", attributes.get("username"));

        ArgumentCaptor<ConsumeWsTicketRequest> captor = ArgumentCaptor.forClass(ConsumeWsTicketRequest.class);
        verify(authServiceFeignClient).consumeWsTicket(captor.capture());
        assertEquals("query-ticket", captor.getValue().getTicket());
        assertEquals(123L, captor.getValue().getUserId());
    }

    @Test
    void beforeHandshake_NonWhitelistOrigin_ShouldReturnForbiddenAndNotConsumeTicket() {
        when(httpServletRequest.getHeader(HttpHeaders.ORIGIN)).thenReturn("https://evil.example");

        boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

        assertFalse(result);
        verify(serverHttpResponse).setStatusCode(HttpStatus.FORBIDDEN);
        verify(authServiceFeignClient, never()).consumeWsTicket(any());
        assertEquals(1.0, handshakeCount("failure", "origin_denied"));
    }

    @Test
    void beforeHandshake_InvalidTicketLogsShouldMaskTicketAndKeepStructuredFields() {
        String rawTicket = "raw-ticket-value-123";
        when(httpServletRequest.getCookies()).thenReturn(new Cookie[]{
                new Cookie("IM_WS_TICKET", rawTicket)
        });
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(false)
                .status(WsTicketConsumeResultDTO.STATUS_INVALID)
                .error("detailed-ticket-invalid-reason")
                .build());
        ListAppender<ILoggingEvent> appender = attachListAppender();

        try {
            boolean result = interceptor.beforeHandshake(serverHttpRequest, serverHttpResponse, webSocketHandler, attributes);

            assertFalse(result);
            String joinedLogs = joinedMessages(appender);
            assertFalse(joinedLogs.contains(rawTicket));
            assertFalse(joinedLogs.contains("detailed-ticket-invalid-reason"));
            assertTrue(joinedLogs.contains("reason=ticket_invalid"));
            assertTrue(joinedLogs.contains("userId=123"));
            assertTrue(joinedLogs.contains("ticketSummary=sha256:"));
        } finally {
            detachListAppender(appender);
        }
    }

    private double handshakeCount(String result, String reason) {
        return meterRegistry.counter("im.websocket.handshake.total", "result", result, "reason", reason).count();
    }

    private ListAppender<ILoggingEvent> attachListAppender() {
        Logger logger = (Logger) LoggerFactory.getLogger(WebSocketHandshakeInterceptor.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        return appender;
    }

    private void detachListAppender(ListAppender<ILoggingEvent> appender) {
        Logger logger = (Logger) LoggerFactory.getLogger(WebSocketHandshakeInterceptor.class);
        logger.detachAppender(appender);
    }

    private String joinedMessages(ListAppender<ILoggingEvent> appender) {
        StringBuilder builder = new StringBuilder();
        for (ILoggingEvent event : appender.list) {
            builder.append(event.getFormattedMessage()).append('\n');
        }
        return builder.toString();
    }
}
