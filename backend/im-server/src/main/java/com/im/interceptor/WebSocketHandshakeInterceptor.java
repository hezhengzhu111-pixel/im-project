package com.im.interceptor;

import com.im.dto.TokenParseResultDTO;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

@Slf4j
@Component
public class WebSocketHandshakeInterceptor implements HandshakeInterceptor {

    @Autowired
    private RestTemplate restTemplate;

    @Value("${im.internal.header:X-Internal-Secret}")
    private String internalHeaderName;

    @Value("${im.internal.secret:im-internal-secret}")
    private String internalSecret;

    @Value("${auth.service.url:http://im-auth-service}")
    private String authServiceUrl;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) throws Exception {
        if (request instanceof ServletServerHttpRequest) {
            ServletServerHttpRequest servletRequest = (ServletServerHttpRequest) request;
            HttpServletRequest httpRequest = servletRequest.getServletRequest();
            String token = extractToken(httpRequest, response);

            if (StringUtils.isBlank(token)) {
                log.warn("WebSocket连接被拒绝: 未提供Token");
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }

            TokenParseResultDTO result = validateToken(token);
            if (result == null || !result.isValid() || result.isExpired()) {
                log.warn("WebSocket连接被拒绝: Token无效");
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }

            String userIdFromUrl = extractUserIdFromUrl(httpRequest.getRequestURI());
            Long userIdFromToken = result.getUserId();

            if (userIdFromToken == null) {
                 log.warn("WebSocket连接被拒绝: Token中不包含用户ID. UrlId={}", userIdFromUrl);
                 response.setStatusCode(HttpStatus.FORBIDDEN);
                 return false;
            }

            if (!userIdFromUrl.equals(userIdFromToken.toString())) {
                log.warn("WebSocket连接被拒绝: 用户ID不匹配. UrlId={}, TokenId={}", userIdFromUrl, userIdFromToken);
                response.setStatusCode(HttpStatus.FORBIDDEN);
                return false;
            }

            attributes.put("userId", userIdFromUrl);

            return true;
        }
        return false;
    }

    private TokenParseResultDTO validateToken(String token) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.TEXT_PLAIN);
            headers.set(internalHeaderName, internalSecret);
            HttpEntity<String> entity = new HttpEntity<>(token, headers);

            ResponseEntity<TokenParseResultDTO> resp = restTemplate.postForEntity(
                    authServiceUrl + "/api/auth/internal/validate-token",
                    entity,
                    TokenParseResultDTO.class
            );
            return resp.getBody();
        } catch (HttpStatusCodeException e) {
            log.warn("验证Token失败: status={} body={}", e.getStatusCode(), e.getResponseBodyAsString());
            return null;
        } catch (Exception e) {
            log.error("验证Token失败", e);
            return null;
        }
    }

    private String extractToken(HttpServletRequest httpRequest, ServerHttpResponse response) {
        String token = httpRequest.getParameter("token");
        if (StringUtils.isNotBlank(token)) {
            return token;
        }

        String protocol = httpRequest.getHeader("Sec-WebSocket-Protocol");
        if (StringUtils.isNotBlank(protocol)) {
            response.getHeaders().set("Sec-WebSocket-Protocol", protocol);
            return protocol;
        }

        String authHeader = httpRequest.getHeader("Authorization");
        if (StringUtils.isNotBlank(authHeader) && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        return null;
    }

    private String extractUserIdFromUrl(String requestUri) {
        if (StringUtils.isBlank(requestUri)) {
            return null;
        }
        int idx = requestUri.lastIndexOf('/');
        if (idx < 0 || idx == requestUri.length() - 1) {
            return null;
        }
        String tail = requestUri.substring(idx + 1);
        int qIdx = tail.indexOf('?');
        if (qIdx >= 0) {
            tail = tail.substring(0, qIdx);
        }
        return tail;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
    }
}
