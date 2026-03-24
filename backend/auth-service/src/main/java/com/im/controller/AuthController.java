package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.TokenPairDTO;
import com.im.dto.TokenParseResultDTO;
import com.im.dto.WsTicketDTO;
import com.im.dto.request.ParseTokenRequest;
import com.im.dto.request.RefreshTokenRequest;
import com.im.service.AuthTokenService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final AuthTokenService authTokenService;

    @PostMapping("/refresh")
    public ApiResponse<TokenPairDTO> refresh(@Validated @RequestBody RefreshTokenRequest request) {
        TokenPairDTO dto = authTokenService.refresh(request);
        return ApiResponse.success(dto);
    }

    @PostMapping("/parse")
    public ApiResponse<TokenParseResultDTO> parse(@Validated @RequestBody ParseTokenRequest request) {
        boolean allowExpired = request.getAllowExpired() != null && request.getAllowExpired();
        TokenParseResultDTO dto = authTokenService.parseAccessToken(request.getToken(), allowExpired);
        return ApiResponse.success(dto);
    }

    @PostMapping("/ws-ticket")
    public ApiResponse<WsTicketDTO> issueWsTicket(
            @RequestHeader(value = "Authorization", required = false) String accessToken
    ) {
        TokenParseResultDTO parseResult = authTokenService.parseAccessToken(accessToken, false);
        if (parseResult == null
                || !parseResult.isValid()
                || parseResult.isExpired()
                || parseResult.getUserId() == null) {
            throw new SecurityException("认证失败");
        }
        return ApiResponse.success(authTokenService.issueWsTicket(parseResult.getUserId(), parseResult.getUsername()));
    }
}
