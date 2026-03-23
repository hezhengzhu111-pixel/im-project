package com.im.feign;

import com.im.dto.AuthUserResourceDTO;
import com.im.dto.PermissionCheckResultDTO;
import com.im.dto.TokenPairDTO;
import com.im.dto.TokenParseResultDTO;
import com.im.dto.TokenRevokeResultDTO;
import com.im.dto.WsTicketConsumeResultDTO;
import com.im.dto.request.CheckPermissionRequest;
import com.im.dto.request.ConsumeWsTicketRequest;
import com.im.dto.request.IssueTokenRequest;
import com.im.dto.request.RevokeTokenRequest;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;

@FeignClient(name = "im-auth-service", path = "/api/auth/internal", configuration = FeignInternalAuthConfig.class)
public interface AuthServiceFeignClient {

    @PostMapping("/token")
    TokenPairDTO issueToken(@RequestBody IssueTokenRequest request);

    @GetMapping("/user-resource/{userId}")
    AuthUserResourceDTO getUserResource(@PathVariable("userId") Long userId);

    @PostMapping("/validate-token")
    TokenParseResultDTO validateToken(@RequestHeader(value = "X-Check-Revoked", required = false) String checkRevoked,
                                      @RequestBody String token);

    default TokenParseResultDTO validateToken(@RequestBody String token) {
        return validateToken(null, token);
    }

    @PostMapping("/check-permission")
    PermissionCheckResultDTO checkPermission(@RequestBody CheckPermissionRequest request);

    @PostMapping("/revoke-token")
    TokenRevokeResultDTO revokeToken(@RequestBody RevokeTokenRequest request);

    @PostMapping("/revoke-user-tokens/{userId}")
    void revokeUserTokens(@PathVariable("userId") Long userId);

    @PostMapping("/ws-ticket/consume")
    WsTicketConsumeResultDTO consumeWsTicket(@RequestBody ConsumeWsTicketRequest request);
}
