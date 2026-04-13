package com.im.feign;

import com.im.dto.ApiResponse;
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
import com.im.exception.BusinessException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AuthServiceFeignClientTest {

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
