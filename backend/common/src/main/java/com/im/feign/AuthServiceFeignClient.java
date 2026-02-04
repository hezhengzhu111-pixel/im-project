package com.im.feign;

import com.im.dto.AuthUserResourceDTO;
import com.im.dto.PermissionCheckResultDTO;
import com.im.dto.TokenPairDTO;
import com.im.dto.TokenParseResultDTO;
import com.im.dto.TokenRevokeResultDTO;
import com.im.dto.request.CheckPermissionRequest;
import com.im.dto.request.IssueTokenRequest;
import com.im.dto.request.RevokeTokenRequest;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "im-auth-service", path = "/api/auth/internal", url = "http://im-auth:8084", configuration = FeignInternalAuthConfig.class)
public interface AuthServiceFeignClient {

    @PostMapping("/token")
    TokenPairDTO issueToken(@RequestBody IssueTokenRequest request);

    @GetMapping("/user-resource/{userId}")
    AuthUserResourceDTO getUserResource(@PathVariable("userId") Long userId);

    @PostMapping("/validate-token")
    TokenParseResultDTO validateToken(@RequestBody String token);

    @PostMapping("/check-permission")
    PermissionCheckResultDTO checkPermission(@RequestBody CheckPermissionRequest request);

    @PostMapping("/revoke-token")
    TokenRevokeResultDTO revokeToken(@RequestBody RevokeTokenRequest request);

    @PostMapping("/revoke-user-tokens/{userId}")
    void revokeUserTokens(@PathVariable("userId") Long userId);
}
