package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.feign.AuthServiceFeignClient;
import com.im.service.ImService;
import com.im.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class UserControllerLogoutTest {

    @Mock
    private UserService userService;

    @Mock
    private ImService imService;

    @Mock
    private AuthServiceFeignClient authServiceFeignClient;

    @InjectMocks
    private UserController userController;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(userController, "accessTokenCookieName", "IM_ACCESS_TOKEN");
        ReflectionTestUtils.setField(userController, "refreshTokenCookieName", "IM_REFRESH_TOKEN");
        ReflectionTestUtils.setField(userController, "authCookieSameSite", "Lax");
    }

    @Test
    void userLogoutRevokesTokensAndOfflineWhenSuccess() {
        doNothing().when(authServiceFeignClient).revokeUserTokens(1L);
        doNothing().when(imService).userOffline("1");

        ApiResponse<String> response =
                userController.userLogout(1L, new MockHttpServletRequest(), new MockHttpServletResponse());

        assertEquals(200, response.getCode());
        verify(authServiceFeignClient).revokeUserTokens(1L);
        verify(imService).userOffline("1");
    }

    @Test
    void userLogoutThrowsWhenRevokeFailed() {
        doThrow(new RuntimeException("revoke fail")).when(authServiceFeignClient).revokeUserTokens(1L);

        assertThrows(
                RuntimeException.class,
                () -> userController.userLogout(1L, new MockHttpServletRequest(), new MockHttpServletResponse())
        );
    }

    @Test
    void userOfflineDelegatesToLogout() {
        doNothing().when(authServiceFeignClient).revokeUserTokens(2L);
        doNothing().when(imService).userOffline("2");

        ApiResponse<String> response =
                userController.userOffline(2L, new MockHttpServletRequest(), new MockHttpServletResponse());

        assertEquals(200, response.getCode());
        verify(authServiceFeignClient).revokeUserTokens(2L);
        verify(imService).userOffline("2");
    }
}
