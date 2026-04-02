package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.UserAuthResponseDTO;
import com.im.dto.UserDTO;
import com.im.dto.request.LoginRequest;
import com.im.exception.BusinessException;
import com.im.service.ImService;
import com.im.service.UserService;
import com.im.feign.AuthServiceFeignClient;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserControllerTest {

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
    void register_ShouldReturnSuccess() {
        UserDTO input = new UserDTO();
        input.setUsername("testUser");
        
        UserDTO output = new UserDTO();
        output.setId("1");
        output.setUsername("testUser");
        
        when(userService.register(any(UserDTO.class))).thenReturn(output);
        
        ApiResponse<UserDTO> response = userController.register(input);
        
        assertEquals(200, response.getCode());
        assertEquals("1", response.getData().getId());
    }

    @Test
    void login_WithPassword_ShouldReturnSuccess() {
        LoginRequest request = new LoginRequest();
        request.setUsername("testUser");
        request.setPassword("password123");
        
        UserAuthResponseDTO authResponse = new UserAuthResponseDTO();
        authResponse.setToken("token_123");
        authResponse.setRefreshToken("refresh_123");
        authResponse.setExpiresInMs(60000L);
        authResponse.setRefreshExpiresInMs(120000L);
        
        when(userService.loginWithPassword("testUser", "password123")).thenReturn(authResponse);
        
        ApiResponse<UserAuthResponseDTO> response =
                userController.login(request, new MockHttpServletRequest(), new MockHttpServletResponse());
        
        assertEquals(200, response.getCode());
        assertEquals("token_123", response.getData().getToken());
        assertEquals(60000L, response.getData().getExpiresInMs());
        assertEquals(null, response.getData().getRefreshToken());
    }

    @Test
    void login_WithToken_ShouldReturnSuccess() {
        LoginRequest request = new LoginRequest();
        request.setUsername("testUser");
        request.setToken("old_token");
        
        UserAuthResponseDTO authResponse = new UserAuthResponseDTO();
        authResponse.setToken("new_token");
        authResponse.setRefreshToken("refresh_456");
        authResponse.setExpiresInMs(60000L);
        authResponse.setRefreshExpiresInMs(120000L);
        
        when(userService.loginWithToken("testUser", "old_token")).thenReturn(authResponse);
        
        ApiResponse<UserAuthResponseDTO> response =
                userController.login(request, new MockHttpServletRequest(), new MockHttpServletResponse());
        
        assertEquals(200, response.getCode());
        assertEquals("new_token", response.getData().getToken());
        assertEquals(120000L, response.getData().getRefreshExpiresInMs());
        assertEquals(null, response.getData().getRefreshToken());
    }

    @Test
    void login_WithoutPasswordOrToken_ShouldThrowException() {
        LoginRequest request = new LoginRequest();
        request.setUsername("testUser");
        
        BusinessException exception = assertThrows(BusinessException.class, () -> {
            userController.login(request, new MockHttpServletRequest(), new MockHttpServletResponse());
        });
        
        assertEquals("请提供密码或token进行登录", exception.getMessage());
    }

    @Test
    void updateProfile_ShouldReturnSuccess() {
        UserDTO input = new UserDTO();
        input.setNickname("newNick");
        
        when(userService.updateProfile(org.mockito.ArgumentMatchers.eq(1L), any(UserDTO.class))).thenReturn(true);
        
        ApiResponse<Boolean> response = userController.updateProfile(1L, input);
        
        assertEquals(200, response.getCode());
        assertEquals(true, response.getData());
    }
}
