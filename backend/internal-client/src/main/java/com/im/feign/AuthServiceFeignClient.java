package com.im.feign;

import com.im.dto.*;
import com.im.dto.request.CheckPermissionRequest;
import com.im.dto.request.ConsumeWsTicketRequest;
import com.im.dto.request.IssueTokenRequest;
import com.im.dto.request.RevokeTokenRequest;
import com.im.exception.BusinessException;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

@FeignClient(
        name = "im-auth-service",
        url = "${im.auth-service.url:}",
        path = "/api/auth/internal",
        configuration = FeignInternalAuthConfig.class
)
public interface AuthServiceFeignClient {

    @PostMapping("/token")
    ApiResponse<TokenPairDTO> issueTokenResponse(@RequestBody IssueTokenRequest request);

    default TokenPairDTO issueToken(IssueTokenRequest request) {
        return unwrap(issueTokenResponse(request));
    }

    @GetMapping("/user-resource/{userId}")
    ApiResponse<AuthUserResourceDTO> getUserResourceResponse(@PathVariable("userId") Long userId);

    default AuthUserResourceDTO getUserResource(Long userId) {
        return unwrap(getUserResourceResponse(userId));
    }

    @PostMapping("/validate-token")
    ApiResponse<TokenParseResultDTO> validateTokenResponse(
            @RequestHeader(value = "X-Check-Revoked", required = false) String checkRevoked,
            @RequestBody String token);

    default TokenParseResultDTO validateToken(String token) {
        return unwrap(validateTokenResponse(null, token));
    }

    default TokenParseResultDTO validateToken(String checkRevoked, String token) {
        return unwrap(validateTokenResponse(checkRevoked, token));
    }

    @PostMapping("/check-permission")
    ApiResponse<PermissionCheckResultDTO> checkPermissionResponse(@RequestBody CheckPermissionRequest request);

    default PermissionCheckResultDTO checkPermission(CheckPermissionRequest request) {
        return unwrap(checkPermissionResponse(request));
    }

    @PostMapping("/revoke-token")
    ApiResponse<TokenRevokeResultDTO> revokeTokenResponse(@RequestBody RevokeTokenRequest request);

    default TokenRevokeResultDTO revokeToken(RevokeTokenRequest request) {
        return unwrap(revokeTokenResponse(request));
    }

    @PostMapping("/revoke-user-tokens/{userId}")
    ApiResponse<Void> revokeUserTokensResponse(@PathVariable("userId") Long userId);

    default void revokeUserTokens(Long userId) {
        unwrap(revokeUserTokensResponse(userId));
    }

    @PostMapping("/ws-ticket/consume")
    ApiResponse<WsTicketConsumeResultDTO> consumeWsTicketResponse(@RequestBody ConsumeWsTicketRequest request);

    default WsTicketConsumeResultDTO consumeWsTicket(ConsumeWsTicketRequest request) {
        return unwrap(consumeWsTicketResponse(request));
    }

    private static <T> T unwrap(ApiResponse<T> response) {
        if (response == null) {
            return null;
        }
        if (Integer.valueOf(200).equals(response.getCode())) {
            return response.getData();
        }
        throw new BusinessException(response.getMessage() == null ? "internal auth service call failed" : response.getMessage());
    }
}
