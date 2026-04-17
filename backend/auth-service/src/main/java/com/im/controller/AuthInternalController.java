package com.im.controller;

import com.im.dto.*;
import com.im.dto.request.CheckPermissionRequest;
import com.im.dto.request.ConsumeWsTicketRequest;
import com.im.dto.request.IssueTokenRequest;
import com.im.dto.request.RevokeTokenRequest;
import com.im.service.AuthPermissionService;
import com.im.service.AuthTokenRevokeService;
import com.im.service.AuthTokenService;
import com.im.service.AuthUserResourceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth/internal")
@RequiredArgsConstructor
@Tag(name = "Internal Auth APIs", description = "Authentication endpoints for internal service-to-service calls")
public class AuthInternalController {

    private final AuthTokenService authTokenService;
    private final AuthUserResourceService authUserResourceService;
    private final AuthPermissionService authPermissionService;
    private final AuthTokenRevokeService authTokenRevokeService;

    @org.springframework.beans.factory.annotation.Value("${im.security.token-revocation-check.enabled:true}")
    private boolean tokenRevocationCheckEnabled;

    @PostMapping("/token")
    @Operation(summary = "Issue token", description = "Issue access and refresh tokens for an authenticated user")
    public ApiResponse<TokenPairDTO> issueToken(HttpServletRequest httpRequest,
                                                @Validated @RequestBody IssueTokenRequest request) {
        authUserResourceService.upsertFromIssueTokenRequest(request);
        return ApiResponse.success(authTokenService.issueTokenPair(request.getUserId(), request.getUsername()));
    }

    @GetMapping("/user-resource/{userId}")
    @Operation(summary = "Get user resource", description = "Load the cached authorization resources for a user")
    public ApiResponse<AuthUserResourceDTO> getUserResource(HttpServletRequest httpRequest,
                                                            @Parameter(description = "User ID") @PathVariable("userId") Long userId) {
        return ApiResponse.success(authUserResourceService.getOrLoad(userId));
    }

    @PostMapping("/validate-token")
    @Operation(summary = "Validate token", description = "Parse and validate an access token")
    public ApiResponse<TokenParseResultDTO> validateToken(HttpServletRequest httpRequest,
                                                          @RequestHeader(value = "X-Check-Revoked", required = false) String checkRevokedHeader,
                                                          @RequestBody String token) {
        String normalizedToken = normalizeBearerToken(token);
        TokenParseResultDTO result = authTokenService.parseAccessToken(normalizedToken, false);
        boolean checkRevoked = checkRevokedHeader == null
                ? tokenRevocationCheckEnabled
                : Boolean.parseBoolean(checkRevokedHeader);
        if (checkRevoked && result != null && result.isValid() && !result.isExpired()
                && authTokenRevokeService.isTokenRevoked(normalizedToken, result)) {
            result.setValid(false);
            result.setError("token宸插悐閿€");
            result.setUserId(null);
            result.setUsername(null);
            result.setIssuedAtEpochMs(null);
            result.setExpiresAtEpochMs(null);
            result.setJti(null);
            result.setTokenType(null);
            result.setPermissions(null);
        }
        return ApiResponse.success(result);
    }

    @PostMapping("/check-permission")
    @Operation(summary = "Check permission", description = "Check whether the user has a target permission")
    public ApiResponse<PermissionCheckResultDTO> checkPermission(HttpServletRequest httpRequest,
                                                                 @Validated @RequestBody CheckPermissionRequest request) {
        return ApiResponse.success(authPermissionService.checkPermission(request));
    }

    @PostMapping("/revoke-token")
    @Operation(summary = "Revoke token", description = "Revoke a specific token")
    public ApiResponse<TokenRevokeResultDTO> revokeToken(HttpServletRequest httpRequest,
                                                         @Validated @RequestBody RevokeTokenRequest request) {
        return ApiResponse.success(authTokenRevokeService.revokeToken(request));
    }

    @PostMapping("/revoke-user-tokens/{userId}")
    @Operation(summary = "Revoke user tokens", description = "Revoke all tokens owned by a user")
    public ApiResponse<Void> revokeUserTokens(HttpServletRequest httpRequest,
                                              @Parameter(description = "User ID") @PathVariable("userId") Long userId) {
        authTokenRevokeService.revokeAllUserTokens(userId);
        return ApiResponse.success();
    }

    @PostMapping("/ws-ticket/consume")
    @Operation(summary = "Consume WebSocket ticket", description = "Validate and consume a one-time WebSocket ticket")
    public ApiResponse<WsTicketConsumeResultDTO> consumeWsTicket(HttpServletRequest httpRequest,
                                                                 @Validated @RequestBody ConsumeWsTicketRequest request) {
        return ApiResponse.success(authTokenService.consumeWsTicket(request.getTicket(), request.getUserId()));
    }

    private String normalizeBearerToken(String token) {
        if (token == null) {
            return null;
        }
        String normalized = token.trim();
        if (normalized.startsWith("\"") && normalized.endsWith("\"") && normalized.length() > 1) {
            normalized = normalized.substring(1, normalized.length() - 1).trim();
        }
        if (normalized.startsWith("Bearer ")) {
            normalized = normalized.substring("Bearer ".length()).trim();
        }
        return normalized;
    }
}
