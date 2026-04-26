package com.im.interceptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.WsTicketConsumeResultDTO;
import com.im.dto.request.ConsumeWsTicketRequest;
import com.im.enums.CommonErrorCode;
import com.im.feign.AuthServiceFeignClient;
import com.im.metrics.ImServerMetrics;
import com.im.util.ApiErrorResponseWriter;
import com.im.util.AuthCookieUtil;
import com.im.util.AuthHeaderUtil;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

@Slf4j
@Component
public class WebSocketHandshakeInterceptor implements HandshakeInterceptor {

    private static final String DEFAULT_ALLOWED_ORIGINS =
            "http://localhost,http://127.0.0.1,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080";
    private static final String HEADER_AUTH_USER = "X-Auth-User";
    private static final String HEADER_AUTH_PERMS = "X-Auth-Perms";
    private static final String HEADER_AUTH_DATA = "X-Auth-Data";
    private static final String HEADER_AUTH_TS = "X-Auth-Ts";
    private static final String HEADER_AUTH_NONCE = "X-Auth-Nonce";
    private static final String HEADER_AUTH_SIGN = "X-Auth-Sign";
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private AuthServiceFeignClient authServiceFeignClient;

    @Autowired(required = false)
    private ImServerMetrics metrics;

    @Value("${im.auth.cookie.ws-ticket-name:IM_WS_TICKET}")
    private String wsTicketCookieName;

    @Value("${im.auth.cookie.ws-ticket-path:/websocket}")
    private String wsTicketCookiePath;

    @Value("${im.auth.cookie.ws-ticket-same-site:Lax}")
    private String wsTicketCookieSameSite;

    @Value("${im.auth.cookie.ws-ticket-secure:auto}")
    private String wsTicketCookieSecure;

    @Value("${im.gateway.user-id-header:X-User-Id}")
    private String gatewayUserIdHeader;

    @Value("${im.gateway.username-header:X-Username}")
    private String gatewayUsernameHeader;

    @Value("${im.gateway.auth.secret}")
    private String gatewayAuthSecret;

    @Value("${im.gateway.auth.max-skew-ms:300000}")
    private long gatewayAuthMaxSkewMs;

    @Value("${im.websocket.allowed-origins:" + DEFAULT_ALLOWED_ORIGINS + "}")
    private String allowedOrigins;

    @Value("${im.websocket.allow-blank-origin:false}")
    private boolean allowBlankOrigin;

    @Value("${im.websocket.allow-query-ticket:false}")
    private boolean allowQueryTicket;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            return reject(response, CommonErrorCode.INTERNAL_AUTH_REJECTED, "unsupported_request",
                    "WebSocket connection rejected. errorCode={}, reason=unsupported_request",
                    CommonErrorCode.INTERNAL_AUTH_REJECTED.getMessage());
        }

        HttpServletRequest httpRequest = servletRequest.getServletRequest();
        String origin = httpRequest.getHeader(HttpHeaders.ORIGIN);
        if (StringUtils.isBlank(origin) && !allowBlankOrigin) {
            return reject(response, CommonErrorCode.WS_ORIGIN_NOT_ALLOWED, "origin_denied",
                    "WebSocket connection rejected. errorCode={}, origin=blank",
                    CommonErrorCode.WS_ORIGIN_NOT_ALLOWED.getMessage());
        }
        if (StringUtils.isNotBlank(origin) && !isOriginAllowed(origin)) {
            return reject(response, CommonErrorCode.WS_ORIGIN_NOT_ALLOWED, "origin_denied",
                    "WebSocket connection rejected. errorCode={}, origin={}",
                    CommonErrorCode.WS_ORIGIN_NOT_ALLOWED.getMessage(), origin);
        }

        Long expectedUserId = extractTrustedUserId(httpRequest);
        if (expectedUserId == null) {
            recordHandshakeFailure("invalid_user");
            log.warn("WebSocket connection rejected. errorCode={}, reason=missing_gateway_user",
                    CommonErrorCode.INTERNAL_AUTH_REJECTED.getMessage());
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
        if (!hasValidGatewaySignature(httpRequest, expectedUserId)) {
            return reject(response, CommonErrorCode.INTERNAL_AUTH_REJECTED, "invalid_gateway_signature",
                    "WebSocket connection rejected. errorCode={}, reason=invalid_gateway_signature, userId={}",
                    CommonErrorCode.INTERNAL_AUTH_REJECTED.getMessage(), expectedUserId);
        }

        TicketResolution ticketResolution = resolveTicket(httpRequest);
        if (ticketResolution.queryRejected()) {
            return reject(response, CommonErrorCode.WS_QUERY_TICKET_NOT_ALLOWED, "missing_ticket",
                    "WebSocket connection rejected. errorCode={}, source=query",
                    CommonErrorCode.WS_QUERY_TICKET_NOT_ALLOWED.getMessage());
        }
        String ticket = ticketResolution.ticket();
        if (StringUtils.isBlank(ticket)) {
            return reject(response, CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED, "missing_ticket",
                    "WebSocket connection rejected. errorCode={}, ticketSummary=missing",
                    CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED.getMessage());
        }

        WsTicketConsumeResultDTO result = consumeWsTicket(ticket, expectedUserId);
        if (result == null || !result.isValid()) {
            CommonErrorCode errorCode = isUserMismatch(result)
                    ? CommonErrorCode.INTERNAL_AUTH_REJECTED
                    : CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED;
            String reason = result == null ? "consume_error" : (isUserMismatch(result) ? "ticket_mismatch" : "ticket_invalid");
            log.debug("WebSocket rejection detail. errorCode={}, reason={}, userId={}, ticketSummary={}, status={}, error={}",
                    errorCode.getMessage(),
                    reason,
                    expectedUserId,
                    summarizeSecret(ticket),
                    result == null ? null : result.getStatus(),
                    result == null ? null : result.getError());
            return reject(response, errorCode, reason,
                    "WebSocket connection rejected. errorCode={}, reason={}, userId={}, ticketSummary={}",
                    errorCode.getMessage(), reason, expectedUserId, summarizeSecret(ticket));
        }
        if (result.getUserId() == null) {
            log.debug("WebSocket rejection detail. errorCode={}, reason=consume_error, userId={}, ticketSummary={}, status={}",
                    CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED.getMessage(),
                    expectedUserId,
                    summarizeSecret(ticket),
                    result.getStatus());
            return reject(response, CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED, "consume_error",
                    "WebSocket connection rejected. errorCode={}, reason=consume_error, userId={}, ticketSummary={}",
                    CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED.getMessage(), expectedUserId, summarizeSecret(ticket));
        }

        attributes.put("userId", String.valueOf(result.getUserId()));
        attributes.put("username", result.getUsername());
        clearWsTicketCookie(response, httpRequest);
        recordHandshakeSuccess();
        return true;
    }

    private WsTicketConsumeResultDTO consumeWsTicket(String ticket, Long userId) {
        try {
            ConsumeWsTicketRequest request = new ConsumeWsTicketRequest();
            request.setTicket(ticket);
            request.setUserId(userId);
            return authServiceFeignClient.consumeWsTicket(request);
        } catch (Exception e) {
            log.warn("Failed to consume ws ticket. userId={}, ticketSummary={}, errorType={}",
                    userId, summarizeSecret(ticket), e.getClass().getSimpleName());
            log.debug("Failed to consume ws ticket detail. userId={}, ticketSummary={}",
                    userId, summarizeSecret(ticket), e);
            return null;
        }
    }

    private boolean isUserMismatch(WsTicketConsumeResultDTO result) {
        return result != null
                && (WsTicketConsumeResultDTO.STATUS_USER_MISMATCH.equals(result.getStatus())
                || (result.getError() != null && result.getError().contains("userId")));
    }

    private TicketResolution resolveTicket(HttpServletRequest httpRequest) {
        String cookieTicket = AuthCookieUtil.getCookieValue(httpRequest, wsTicketCookieName);
        if (StringUtils.isNotBlank(cookieTicket)) {
            return new TicketResolution(cookieTicket, false);
        }
        String queryTicket = httpRequest == null ? null : httpRequest.getParameter("ticket");
        if (StringUtils.isNotBlank(queryTicket) && !allowQueryTicket) {
            return new TicketResolution(null, true);
        }
        if (allowQueryTicket && StringUtils.isNotBlank(queryTicket)) {
            return new TicketResolution(queryTicket, false);
        }
        return new TicketResolution(null, false);
    }

    private void clearWsTicketCookie(ServerHttpResponse response, HttpServletRequest request) {
        boolean secure = AuthCookieUtil.resolveSecure(request, wsTicketCookieSecure);
        response.getHeaders().add(
                HttpHeaders.SET_COOKIE,
                AuthCookieUtil.clearCookie(
                        wsTicketCookieName,
                        secure,
                        wsTicketCookieSameSite,
                        wsTicketCookiePath
                ).toString()
        );
    }

    private boolean isOriginAllowed(String origin) {
        if (StringUtils.isBlank(origin)) {
            return true;
        }
        for (String allowedOrigin : resolveAllowedOrigins()) {
            if ("*".equals(allowedOrigin) || origin.equalsIgnoreCase(allowedOrigin)) {
                return true;
            }
        }
        return false;
    }

    private String[] resolveAllowedOrigins() {
        if (StringUtils.isBlank(allowedOrigins)) {
            return new String[0];
        }
        return java.util.Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(StringUtils::isNotBlank)
                .toArray(String[]::new);
    }

    private Long extractTrustedUserId(HttpServletRequest httpRequest) {
        if (httpRequest == null || StringUtils.isBlank(gatewayUserIdHeader)) {
            return null;
        }
        String rawUserId = httpRequest.getHeader(gatewayUserIdHeader);
        if (StringUtils.isBlank(rawUserId)) {
            return null;
        }
        try {
            return Long.valueOf(rawUserId.trim());
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private boolean hasValidGatewaySignature(HttpServletRequest httpRequest, Long userId) {
        if (httpRequest == null || userId == null || StringUtils.isBlank(gatewayUsernameHeader)
                || StringUtils.isBlank(gatewayAuthSecret)) {
            return false;
        }
        GatewayAuthHeaders headers = readGatewayAuthHeaders(httpRequest);
        if (!headers.isComplete()) {
            return false;
        }
        Long timestamp = parseTimestamp(headers.ts());
        if (timestamp == null || !withinAllowedClockSkew(timestamp, gatewayAuthMaxSkewMs)) {
            return false;
        }
        return AuthHeaderUtil.verifyHmacSha256(
                gatewayAuthSecret,
                AuthHeaderUtil.buildSignedFields(
                        String.valueOf(userId),
                        headers.username().trim(),
                        headers.userB64(),
                        headers.permsB64(),
                        headers.dataB64(),
                        headers.ts(),
                        headers.nonce()
                ),
                headers.sign()
        );
    }

    private GatewayAuthHeaders readGatewayAuthHeaders(HttpServletRequest httpRequest) {
        return new GatewayAuthHeaders(
                httpRequest.getHeader(gatewayUsernameHeader),
                httpRequest.getHeader(HEADER_AUTH_USER),
                httpRequest.getHeader(HEADER_AUTH_PERMS),
                httpRequest.getHeader(HEADER_AUTH_DATA),
                httpRequest.getHeader(HEADER_AUTH_TS),
                httpRequest.getHeader(HEADER_AUTH_NONCE),
                httpRequest.getHeader(HEADER_AUTH_SIGN)
        );
    }

    private Long parseTimestamp(String value) {
        try {
            return Long.valueOf(value);
        } catch (Exception e) {
            return null;
        }
    }

    private boolean withinAllowedClockSkew(long timestamp, long allowedSkewMs) {
        long now = System.currentTimeMillis();
        return Math.abs(now - timestamp) <= allowedSkewMs;
    }

    private void recordHandshakeSuccess() {
        if (metrics != null) {
            metrics.recordHandshakeSuccess();
        }
    }

    private void recordHandshakeFailure(String reason) {
        if (metrics != null) {
            metrics.recordHandshakeFailure(reason);
        }
    }

    private boolean reject(ServerHttpResponse response,
                           CommonErrorCode errorCode,
                           String metricReason,
                           String logMessage,
                           Object... logArgs) {
        recordHandshakeFailure(metricReason);
        log.warn(logMessage, logArgs);
        ApiErrorResponseWriter.writeServerError(objectMapper, response, errorCode);
        return false;
    }

    private String summarizeSecret(String value) {
        if (StringUtils.isBlank(value)) {
            return "missing";
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.trim().getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < Math.min(6, digest.length); i++) {
                sb.append(String.format("%02x", digest[i]));
            }
            return "sha256:" + sb + ",len=" + value.trim().length();
        } catch (Exception e) {
            return "len=" + value.trim().length();
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
    }

    private record GatewayAuthHeaders(String username,
                                      String userB64,
                                      String permsB64,
                                      String dataB64,
                                      String ts,
                                      String nonce,
                                      String sign) {
        private boolean isComplete() {
            return StringUtils.isNoneBlank(username, userB64, permsB64, dataB64, ts, nonce, sign);
        }
    }

    private record TicketResolution(String ticket, boolean queryRejected) {
    }
}
