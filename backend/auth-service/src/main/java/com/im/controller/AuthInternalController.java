package com.im.controller;

import com.im.dto.AuthUserResourceDTO;
import com.im.dto.PermissionCheckResultDTO;
import com.im.dto.TokenPairDTO;
import com.im.dto.TokenParseResultDTO;
import com.im.dto.TokenRevokeResultDTO;
import com.im.dto.request.CheckPermissionRequest;
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
@Tag(name = "认证服务内部接口", description = "供其他服务调用的认证授权接口")
public class AuthInternalController {

    private final AuthTokenService authTokenService;
    private final AuthUserResourceService authUserResourceService;
    private final AuthPermissionService authPermissionService;
    private final AuthTokenRevokeService authTokenRevokeService;

    @org.springframework.beans.factory.annotation.Value("${im.internal.secret:im-internal-secret}")
    private String internalSecret;

    @org.springframework.beans.factory.annotation.Value("${im.internal.header:X-Internal-Secret}")
    private String internalHeader;

    @org.springframework.beans.factory.annotation.Value("${im.security.token-revocation-check.enabled:true}")
    private boolean tokenRevocationCheckEnabled;

    @PostMapping("/token")
    @Operation(summary = "颁发Token", description = "为用户颁发访问令牌和刷新令牌")
    public TokenPairDTO issueToken(HttpServletRequest httpRequest,
                                   @Validated @RequestBody IssueTokenRequest request) {
        verify(httpRequest);
        authUserResourceService.upsertFromIssueTokenRequest(request);
        return authTokenService.issueTokenPair(request.getUserId(), request.getUsername());
    }

    @GetMapping("/user-resource/{userId}")
    @Operation(summary = "获取用户资源", description = "获取用户的资源权限信息")
    public AuthUserResourceDTO getUserResource(HttpServletRequest httpRequest,
                                               @Parameter(description = "用户ID") @PathVariable("userId") Long userId) {
        verify(httpRequest);
        return authUserResourceService.getOrLoad(userId);
    }

    @PostMapping("/validate-token")
    @Operation(summary = "验证Token", description = "验证访问令牌的有效性")
    public TokenParseResultDTO validateToken(HttpServletRequest httpRequest,
                                             @RequestHeader(value = "X-Check-Revoked", required = false) String checkRevokedHeader,
                                             @RequestBody String token) {
        verify(httpRequest);
        String normalizedToken = normalizeBearerToken(token);
        TokenParseResultDTO result = authTokenService.parseAccessToken(normalizedToken, false);
        boolean checkRevoked = checkRevokedHeader == null
                ? tokenRevocationCheckEnabled
                : Boolean.parseBoolean(checkRevokedHeader);
        if (checkRevoked && result != null && result.isValid() && !result.isExpired()
                && authTokenRevokeService.isTokenRevoked(normalizedToken)) {
            result.setValid(false);
            result.setError("token已吊销");
            result.setUserId(null);
            result.setUsername(null);
            result.setIssuedAtEpochMs(null);
            result.setExpiresAtEpochMs(null);
            result.setJti(null);
            result.setTokenType(null);
        }
        return result;
    }

    @PostMapping("/check-permission")
    @Operation(summary = "检查权限", description = "检查用户是否具有指定的权限")
    public PermissionCheckResultDTO checkPermission(HttpServletRequest httpRequest,
                                                @Validated @RequestBody CheckPermissionRequest request) {
        verify(httpRequest);
        return authPermissionService.checkPermission(request);
    }

    @PostMapping("/revoke-token")
    @Operation(summary = "吊销Token", description = "吊销指定的令牌")
    public TokenRevokeResultDTO revokeToken(HttpServletRequest httpRequest,
                                           @Validated @RequestBody RevokeTokenRequest request) {
        verify(httpRequest);
        return authTokenRevokeService.revokeToken(request);
    }

    @PostMapping("/revoke-user-tokens/{userId}")
    @Operation(summary = "吊销用户所有Token", description = "吊销指定用户的所有令牌")
    public void revokeUserTokens(HttpServletRequest httpRequest,
                                 @Parameter(description = "用户ID") @PathVariable("userId") Long userId) {
        verify(httpRequest);
        authTokenRevokeService.revokeAllUserTokens(userId);
    }

    private void verify(HttpServletRequest httpRequest) {
        String secret = httpRequest.getHeader(internalHeader);
        if (secret == null) {
            secret = httpRequest.getHeader("X-Internal-Secret");
        }
        if (secret == null || !internalSecret.equals(secret)) {
            throw new SecurityException("Forbidden");
        }
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
