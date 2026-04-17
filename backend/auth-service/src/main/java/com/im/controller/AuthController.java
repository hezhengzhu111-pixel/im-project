package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.TokenPairDTO;
import com.im.dto.TokenParseResultDTO;
import com.im.dto.WsTicketDTO;
import com.im.dto.request.ParseTokenRequest;
import com.im.dto.request.RefreshTokenRequest;
import com.im.service.AuthTokenService;
import com.im.util.AuthCookieUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final AuthTokenService authTokenService;

    @Value("${im.auth.cookie.access-token-name:IM_ACCESS_TOKEN}")
    private String accessTokenCookieName;

    @Value("${im.auth.cookie.refresh-token-name:IM_REFRESH_TOKEN}")
    private String refreshTokenCookieName;

    @Value("${im.auth.cookie.same-site:Lax}")
    private String authCookieSameSite;

    @Value("${im.auth.cookie.secure:auto}")
    private String authCookieSecure;

    @Value("${im.auth.cookie.ws-ticket-name:IM_WS_TICKET}")
    private String wsTicketCookieName;

    @Value("${im.auth.cookie.ws-ticket-path:/websocket}")
    private String wsTicketCookiePath;

    @Value("${im.auth.cookie.ws-ticket-same-site:Lax}")
    private String wsTicketCookieSameSite;

    @Value("${im.auth.cookie.ws-ticket-secure:auto}")
    private String wsTicketCookieSecure;

    @PostMapping("/refresh")
    public ApiResponse<TokenPairDTO> refresh(
            @RequestBody(required = false) RefreshTokenRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        RefreshTokenRequest effectiveRequest = request == null ? new RefreshTokenRequest() : request;
        if (effectiveRequest.getRefreshToken() == null || effectiveRequest.getRefreshToken().isBlank()) {
            effectiveRequest.setRefreshToken(AuthCookieUtil.getCookieValue(httpRequest, refreshTokenCookieName));
        }
        if (effectiveRequest.getAccessToken() == null || effectiveRequest.getAccessToken().isBlank()) {
            effectiveRequest.setAccessToken(AuthCookieUtil.getCookieValue(httpRequest, accessTokenCookieName));
        }
        TokenPairDTO dto = authTokenService.refresh(effectiveRequest);
        writeAuthCookies(httpResponse, httpRequest, dto);
        TokenPairDTO tokenPairDTO = new TokenPairDTO();
        tokenPairDTO.setAccessToken(dto.getAccessToken());
        tokenPairDTO.setExpiresInMs(dto.getExpiresInMs());
        tokenPairDTO.setRefreshExpiresInMs(dto.getRefreshExpiresInMs());
        return ApiResponse.success(tokenPairDTO);
    }

    @PostMapping("/parse")
    public ApiResponse<TokenParseResultDTO> parse(
            @RequestBody(required = false) ParseTokenRequest request,
            HttpServletRequest httpRequest
    ) {
        ParseTokenRequest effectiveRequest = request == null ? new ParseTokenRequest() : request;
        String token = effectiveRequest.getToken();
        if (token == null || token.isBlank()) {
            token = AuthCookieUtil.getCookieValue(httpRequest, accessTokenCookieName);
        }
        boolean allowExpired = effectiveRequest.getAllowExpired() != null && effectiveRequest.getAllowExpired();
        TokenParseResultDTO dto = authTokenService.parseAccessToken(token, allowExpired);
        return ApiResponse.success(dto);
    }

    @PostMapping("/ws-ticket")
    public ApiResponse<WsTicketDTO> issueWsTicket(
            @RequestAttribute(value = "userId", required = false) Long userId,
            @RequestAttribute(value = "username", required = false) String username,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        if (userId == null || username == null || username.isBlank()) {
            throw new SecurityException("认证失败");
        }
        WsTicketDTO dto = authTokenService.issueWsTicket(userId, username);
        writeWsTicketCookie(httpResponse, httpRequest, dto);
        return ApiResponse.success(dto);
    }

    private void writeAuthCookies(
            HttpServletResponse response,
            HttpServletRequest request,
            TokenPairDTO tokenPair
    ) {
        boolean secure = AuthCookieUtil.resolveSecure(request, authCookieSecure);
        response.addHeader(
                HttpHeaders.SET_COOKIE,
                AuthCookieUtil.buildTokenCookie(
                        accessTokenCookieName,
                        tokenPair.getAccessToken(),
                        toSeconds(tokenPair.getExpiresInMs()),
                        secure,
                        authCookieSameSite
                ).toString()
        );
        response.addHeader(
                HttpHeaders.SET_COOKIE,
                AuthCookieUtil.buildTokenCookie(
                        refreshTokenCookieName,
                        tokenPair.getRefreshToken(),
                        toSeconds(tokenPair.getRefreshExpiresInMs()),
                        secure,
                        authCookieSameSite
                ).toString()
        );
    }

    private void writeWsTicketCookie(
            HttpServletResponse response,
            HttpServletRequest request,
            WsTicketDTO wsTicket
    ) {
        if (response == null
                || wsTicket == null
                || wsTicket.getTicket() == null
                || wsTicket.getTicket().isBlank()) {
            return;
        }
        boolean secure = AuthCookieUtil.resolveSecure(request, wsTicketCookieSecure);
        ResponseCookie cookie = ResponseCookie.from(wsTicketCookieName, wsTicket.getTicket())
                .httpOnly(true)
                .secure(secure)
                .sameSite(resolveSameSite(wsTicketCookieSameSite))
                .path(normalizeCookiePath(wsTicketCookiePath))
                .maxAge(toSeconds(wsTicket.getExpiresInMs()))
                .build();
        response.addHeader(
                HttpHeaders.SET_COOKIE,
                cookie.toString()
        );
    }

    private long toSeconds(Long millis) {
        if (millis == null || millis <= 0) {
            return -1;
        }
        long seconds = millis / 1000;
        return seconds > 0 ? seconds : 1;
    }

    private String resolveSameSite(String sameSite) {
        return sameSite == null || sameSite.isBlank() ? "Lax" : sameSite.trim();
    }

    private String normalizeCookiePath(String path) {
        if (path == null || path.isBlank()) {
            return "/";
        }
        String trimmed = path.trim();
        return trimmed.startsWith("/") ? trimmed : "/" + trimmed;
    }
}
