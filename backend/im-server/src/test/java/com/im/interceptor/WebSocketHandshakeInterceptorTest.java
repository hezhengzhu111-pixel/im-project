package com.im.interceptor;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.WsTicketConsumeResultDTO;
import com.im.dto.request.ConsumeWsTicketRequest;
import com.im.enums.CommonErrorCode;
import com.im.feign.AuthServiceFeignClient;
import com.im.metrics.ImServerMetrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.WebSocketHandler;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WebSocketHandshakeInterceptorTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private AuthServiceFeignClient authServiceFeignClient;

    @Mock
    private WebSocketHandler webSocketHandler;

    @InjectMocks
    private WebSocketHandshakeInterceptor interceptor;

    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
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
    }

    @Test
    void beforeHandshake_NoTicket_ShouldReturnUnifiedWsTicketError() throws Exception {
        HandshakeFixture fixture = fixture();

        boolean result = interceptor.beforeHandshake(fixture.request(), fixture.response(), webSocketHandler, fixture.attributes());

        assertFalse(result);
        assertError(fixture.servletResponse(), CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED);
        assertEquals(1.0, handshakeCount("failure", "missing_ticket"));
    }

    @Test
    void beforeHandshake_MissingTrustedUserHeader_ShouldReturnInternalAuthRejected() throws Exception {
        HandshakeFixture fixture = fixture();
        fixture.servletRequest().setCookies(new Cookie("IM_WS_TICKET", "cookie-ticket"));
        fixture.servletRequest().removeHeader("X-User-Id");

        boolean result = interceptor.beforeHandshake(fixture.request(), fixture.response(), webSocketHandler, fixture.attributes());

        assertFalse(result);
        assertError(fixture.servletResponse(), CommonErrorCode.INTERNAL_AUTH_REJECTED);
        verify(authServiceFeignClient, never()).consumeWsTicket(any());
        assertEquals(1.0, handshakeCount("failure", "invalid_user"));
    }

    @Test
    void beforeHandshake_InvalidTicket_ShouldReturnUnifiedWsTicketError() throws Exception {
        HandshakeFixture fixture = fixture();
        fixture.servletRequest().setCookies(new Cookie("IM_WS_TICKET", "cookie-ticket"));
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(false)
                .status(WsTicketConsumeResultDTO.STATUS_INVALID)
                .error("invalid")
                .build());

        boolean result = interceptor.beforeHandshake(fixture.request(), fixture.response(), webSocketHandler, fixture.attributes());

        assertFalse(result);
        assertError(fixture.servletResponse(), CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED);
        assertEquals(1.0, handshakeCount("failure", "ticket_invalid"));
    }

    @Test
    void beforeHandshake_UserIdMismatch_ShouldReturnInternalAuthRejected() throws Exception {
        HandshakeFixture fixture = fixture();
        fixture.servletRequest().setCookies(new Cookie("IM_WS_TICKET", "cookie-ticket"));
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(false)
                .status(WsTicketConsumeResultDTO.STATUS_USER_MISMATCH)
                .userId(456L)
                .username("mallory")
                .error("ticket-user-mismatch")
                .build());

        boolean result = interceptor.beforeHandshake(fixture.request(), fixture.response(), webSocketHandler, fixture.attributes());

        assertFalse(result);
        assertError(fixture.servletResponse(), CommonErrorCode.INTERNAL_AUTH_REJECTED);
        assertEquals(1.0, handshakeCount("failure", "ticket_mismatch"));
    }

    @Test
    void beforeHandshake_ForgedUrlUserIdShouldNotAffectFinalSessionUserId() {
        HandshakeFixture fixture = fixture();
        fixture.servletRequest().setRequestURI("/websocket/999999");
        fixture.servletRequest().setCookies(new Cookie("IM_WS_TICKET", "cookie-ticket"));
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(true)
                .status(WsTicketConsumeResultDTO.STATUS_VALID)
                .userId(123L)
                .username("alice")
                .build());

        boolean result = interceptor.beforeHandshake(fixture.request(), fixture.response(), webSocketHandler, fixture.attributes());

        assertTrue(result);
        assertEquals("123", fixture.attributes().get("userId"));
        assertEquals("alice", fixture.attributes().get("username"));

        ArgumentCaptor<ConsumeWsTicketRequest> captor = ArgumentCaptor.forClass(ConsumeWsTicketRequest.class);
        verify(authServiceFeignClient).consumeWsTicket(captor.capture());
        assertEquals("cookie-ticket", captor.getValue().getTicket());
        assertEquals(123L, captor.getValue().getUserId());

        String setCookie = fixture.response().getHeaders().getFirst(HttpHeaders.SET_COOKIE);
        assertNotNull(setCookie);
        assertTrue(setCookie.contains("IM_WS_TICKET="));
        assertTrue(setCookie.contains("Max-Age=0"));
        assertTrue(setCookie.contains("Path=/websocket"));
        assertEquals(1.0, handshakeCount("success", "success"));
    }

    @Test
    void beforeHandshake_BlankOriginShouldBeRejectedByDefault() throws Exception {
        HandshakeFixture fixture = fixture();
        fixture.servletRequest().removeHeader(HttpHeaders.ORIGIN);

        boolean result = interceptor.beforeHandshake(fixture.request(), fixture.response(), webSocketHandler, fixture.attributes());

        assertFalse(result);
        assertError(fixture.servletResponse(), CommonErrorCode.WS_ORIGIN_NOT_ALLOWED);
        verify(authServiceFeignClient, never()).consumeWsTicket(any());
        assertEquals(1.0, handshakeCount("failure", "origin_denied"));
    }

    @Test
    void beforeHandshake_BlankOriginShouldPassWhenExplicitlyAllowed() {
        HandshakeFixture fixture = fixture();
        ReflectionTestUtils.setField(interceptor, "allowBlankOrigin", true);
        fixture.servletRequest().removeHeader(HttpHeaders.ORIGIN);
        fixture.servletRequest().setCookies(new Cookie("IM_WS_TICKET", "cookie-ticket"));
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(true)
                .status(WsTicketConsumeResultDTO.STATUS_VALID)
                .userId(123L)
                .username("alice")
                .build());

        boolean result = interceptor.beforeHandshake(fixture.request(), fixture.response(), webSocketHandler, fixture.attributes());

        assertTrue(result);
        assertEquals("123", fixture.attributes().get("userId"));
        assertEquals("alice", fixture.attributes().get("username"));
    }

    @Test
    void beforeHandshake_QueryTicketShouldBeRejectedByDefault() throws Exception {
        HandshakeFixture fixture = fixture();
        fixture.servletRequest().setParameter("ticket", "query-ticket");

        boolean result = interceptor.beforeHandshake(fixture.request(), fixture.response(), webSocketHandler, fixture.attributes());

        assertFalse(result);
        assertError(fixture.servletResponse(), CommonErrorCode.WS_QUERY_TICKET_NOT_ALLOWED);
        verify(authServiceFeignClient, never()).consumeWsTicket(any());
        assertEquals(1.0, handshakeCount("failure", "missing_ticket"));
    }

    @Test
    void beforeHandshake_QueryTicketShouldPassWhenExplicitlyAllowed() {
        HandshakeFixture fixture = fixture();
        ReflectionTestUtils.setField(interceptor, "allowQueryTicket", true);
        fixture.servletRequest().setParameter("ticket", "query-ticket");
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(true)
                .status(WsTicketConsumeResultDTO.STATUS_VALID)
                .userId(123L)
                .username("alice")
                .build());

        boolean result = interceptor.beforeHandshake(fixture.request(), fixture.response(), webSocketHandler, fixture.attributes());

        assertTrue(result);
        ArgumentCaptor<ConsumeWsTicketRequest> captor = ArgumentCaptor.forClass(ConsumeWsTicketRequest.class);
        verify(authServiceFeignClient).consumeWsTicket(captor.capture());
        assertEquals("query-ticket", captor.getValue().getTicket());
        assertEquals(123L, captor.getValue().getUserId());
    }

    @Test
    void beforeHandshake_NonWhitelistOrigin_ShouldReturnForbiddenAndNotConsumeTicket() throws Exception {
        HandshakeFixture fixture = fixture();
        fixture.servletRequest().removeHeader(HttpHeaders.ORIGIN);
        fixture.servletRequest().addHeader(HttpHeaders.ORIGIN, "https://evil.example");

        boolean result = interceptor.beforeHandshake(fixture.request(), fixture.response(), webSocketHandler, fixture.attributes());

        assertFalse(result);
        assertError(fixture.servletResponse(), CommonErrorCode.WS_ORIGIN_NOT_ALLOWED);
        verify(authServiceFeignClient, never()).consumeWsTicket(any());
        assertEquals(1.0, handshakeCount("failure", "origin_denied"));
    }

    @Test
    void beforeHandshake_InvalidTicketLogsShouldMaskTicketAndKeepStructuredFields() {
        HandshakeFixture fixture = fixture();
        String rawTicket = "raw-ticket-value-123";
        fixture.servletRequest().setCookies(new Cookie("IM_WS_TICKET", rawTicket));
        when(authServiceFeignClient.consumeWsTicket(any())).thenReturn(WsTicketConsumeResultDTO.builder()
                .valid(false)
                .status(WsTicketConsumeResultDTO.STATUS_INVALID)
                .error("detailed-ticket-invalid-reason")
                .build());
        ListAppender<ILoggingEvent> appender = attachListAppender();

        try {
            boolean result = interceptor.beforeHandshake(fixture.request(), fixture.response(), webSocketHandler, fixture.attributes());

            assertFalse(result);
            String joinedLogs = joinedMessages(appender);
            assertFalse(joinedLogs.contains(rawTicket));
            assertFalse(joinedLogs.contains("detailed-ticket-invalid-reason"));
            assertTrue(joinedLogs.contains("errorCode=WS_TICKET_INVALID_OR_EXPIRED"));
            assertTrue(joinedLogs.contains("reason=ticket_invalid"));
            assertTrue(joinedLogs.contains("userId=123"));
            assertTrue(joinedLogs.contains("ticketSummary=sha256:"));
        } finally {
            detachListAppender(appender);
        }
    }

    private HandshakeFixture fixture() {
        MockHttpServletRequest servletRequest = new MockHttpServletRequest("GET", "/websocket/123");
        servletRequest.addHeader(HttpHeaders.ORIGIN, "http://localhost");
        servletRequest.addHeader("X-User-Id", "123");
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();
        return new HandshakeFixture(
                servletRequest,
                servletResponse,
                new ServletServerHttpRequest(servletRequest),
                new ServletServerHttpResponse(servletResponse),
                new HashMap<>()
        );
    }

    private void assertError(MockHttpServletResponse response, CommonErrorCode errorCode) throws Exception {
        assertEquals(errorCode.getHttpStatus().value(), response.getStatus());
        Map<?, ?> body = objectMapper.readValue(response.getContentAsByteArray(), Map.class);
        assertEquals(errorCode.getCode(), body.get("code"));
        assertEquals(errorCode.getMessage(), body.get("message"));
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

    private record HandshakeFixture(MockHttpServletRequest servletRequest,
                                    MockHttpServletResponse servletResponse,
                                    ServletServerHttpRequest request,
                                    ServletServerHttpResponse response,
                                    Map<String, Object> attributes) {
    }
}
