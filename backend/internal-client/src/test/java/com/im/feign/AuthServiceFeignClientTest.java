package com.im.feign;

import com.im.dto.*;
import com.im.dto.request.CheckPermissionRequest;
import com.im.dto.request.ConsumeWsTicketRequest;
import com.im.dto.request.IssueTokenRequest;
import com.im.dto.request.RevokeTokenRequest;
import com.im.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.openfeign.FeignClient;

import static org.junit.jupiter.api.Assertions.*;

class AuthServiceFeignClientTest {

    @Test
    void feignClient_shouldAllowDirectAuthServiceUrlOverride() {
        FeignClient annotation = AuthServiceFeignClient.class.getAnnotation(FeignClient.class);

        assertEquals("${im.auth-service.url:}", annotation.url());
        assertEquals("im-auth-service", annotation.name());
        assertEquals("/api/auth/internal", annotation.path());
    }

    @Test
    void issueToken_shouldUnwrapTokenPairFromApiResponseData() {
        TokenPairDTO tokenPair = new TokenPairDTO();
        tokenPair.setAccessToken("access-token");
        tokenPair.setRefreshToken("refresh-token");
        tokenPair.setExpiresInMs(1000L);
        tokenPair.setRefreshExpiresInMs(2000L);
        AuthServiceFeignClient client = new StubAuthServiceFeignClient(ApiResponse.success(tokenPair));

        TokenPairDTO result = client.issueToken(new IssueTokenRequest());

        assertSame(tokenPair, result);
        assertEquals("access-token", result.getAccessToken());
        assertEquals("refresh-token", result.getRefreshToken());
    }

    @Test
    void issueToken_shouldThrowWhenInternalAuthResponseFails() {
        AuthServiceFeignClient client = new StubAuthServiceFeignClient(ApiResponse.error(500, "auth failed"));

        BusinessException exception = assertThrows(
                BusinessException.class,
                () -> client.issueToken(new IssueTokenRequest())
        );

        assertEquals("auth failed", exception.getMessage());
    }

    private static class StubAuthServiceFeignClient implements AuthServiceFeignClient {
        private final ApiResponse<TokenPairDTO> issueTokenResponse;

        private StubAuthServiceFeignClient(ApiResponse<TokenPairDTO> issueTokenResponse) {
            this.issueTokenResponse = issueTokenResponse;
        }

        @Override
        public ApiResponse<TokenPairDTO> issueTokenResponse(IssueTokenRequest request) {
            return issueTokenResponse;
        }

        @Override
        public ApiResponse<AuthUserResourceDTO> getUserResourceResponse(Long userId) {
            return ApiResponse.success(null);
        }

        @Override
        public ApiResponse<TokenParseResultDTO> validateTokenResponse(String checkRevoked, String token) {
            return ApiResponse.success(null);
        }

        @Override
        public ApiResponse<PermissionCheckResultDTO> checkPermissionResponse(CheckPermissionRequest request) {
            return ApiResponse.success(null);
        }

        @Override
        public ApiResponse<TokenRevokeResultDTO> revokeTokenResponse(RevokeTokenRequest request) {
            return ApiResponse.success(null);
        }

        @Override
        public ApiResponse<Void> revokeUserTokensResponse(Long userId) {
            return ApiResponse.success(null);
        }

        @Override
        public ApiResponse<WsTicketConsumeResultDTO> consumeWsTicketResponse(ConsumeWsTicketRequest request) {
            return ApiResponse.success(null);
        }
    }
}
