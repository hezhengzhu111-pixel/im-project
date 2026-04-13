package com.im.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.UserDTO;
import com.im.exception.BusinessException;
import com.im.feign.AuthServiceFeignClient;
import com.im.mapper.UserMapper;
import com.im.mapper.UserSettingsMapper;
import com.im.user.entity.User;
import com.im.util.DTOConverter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceImplSecurityTest {

    @Mock
    private UserMapper userMapper;
    @Mock
    private UserSettingsMapper userSettingsMapper;
    @Mock
    private DTOConverter dtoConverter;
    @Mock
    private AuthServiceFeignClient authServiceFeignClient;
    @Mock
    private StringRedisTemplate redisTemplate;
    @Mock
    private ValueOperations<String, String> valueOperations;

    private UserServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new UserServiceImpl(
                userMapper,
                userSettingsMapper,
                dtoConverter,
                authServiceFeignClient,
                redisTemplate,
                new ObjectMapper()
        );
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    @Test
    void registerNormalizesUsernameBeforeInsert() {
        when(userMapper.selectCount(any())).thenReturn(0L);
        when(dtoConverter.toUserDTO(any(User.class))).thenAnswer(invocation -> {
            User saved = invocation.getArgument(0);
            return UserDTO.builder().username(saved.getUsername()).build();
        });
        UserDTO request = UserDTO.builder()
                .username("  Alice_1  ")
                .password("abc12345")
                .nickname("Alice")
                .build();

        UserDTO result = service.register(request);

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userMapper).insert(captor.capture());
        assertEquals("alice_1", captor.getValue().getUsername());
        assertEquals("alice_1", result.getUsername());
    }

    @Test
    void loginUsesGenericErrorForMissingUser() {
        when(valueOperations.get("im:login:fail:unknown:alice")).thenReturn(null);
        when(userMapper.selectOne(any())).thenReturn(null);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.loginWithPassword(" Alice ", "bad-password"));

        assertEquals("用户名或密码错误", ex.getMessage());
        verify(valueOperations).increment("im:login:fail:unknown:alice");
    }

    @Test
    void loginRejectsWhenFailureLimitReached() {
        when(valueOperations.get("im:login:fail:unknown:alice")).thenReturn("5");

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.loginWithPassword("alice", "abc12345"));

        assertEquals("登录失败次数过多，请稍后再试", ex.getMessage());
    }

    @Test
    void sendVerificationCodeRateLimitsAndStoresSecureCode() {
        when(valueOperations.increment("im:verify:rate:minute:unknown:target@example.com")).thenReturn(1L);
        when(valueOperations.increment("im:verify:rate:day:unknown:target@example.com")).thenReturn(1L);

        service.sendVerificationCode(" Target@Example.com ");

        ArgumentCaptor<String> codeCaptor = ArgumentCaptor.forClass(String.class);
        verify(valueOperations).set(eq("im:verify:code:target@example.com"), codeCaptor.capture(), eq(5L), eq(TimeUnit.MINUTES));
        assertTrue(codeCaptor.getValue().matches("\\d{6}"));
    }
}
