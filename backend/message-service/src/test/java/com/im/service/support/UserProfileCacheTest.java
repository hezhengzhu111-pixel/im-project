package com.im.service.support;

import com.im.dto.UserDTO;
import com.im.feign.UserServiceFeignClient;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

public class UserProfileCacheTest {

    @Test
    void getUser_shouldReturnCachedUser() {
        UserServiceFeignClient userClient = mock(UserServiceFeignClient.class);
        @SuppressWarnings("unchecked")
        RedisTemplate<Object, Object> redisTemplate = (RedisTemplate<Object, Object>) mock(RedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<Object, Object> ops = (ValueOperations<Object, Object>) mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(ops);

        UserDTO cached = UserDTO.builder().id("1").username("u1").build();
        when(ops.get("user:brief:1")).thenReturn(cached);

        UserProfileCache cache = new UserProfileCache(redisTemplate, userClient);
        ReflectionTestUtils.setField(cache, "userCacheKeyPrefix", "user:brief:");
        ReflectionTestUtils.setField(cache, "userCacheTtlMinutes", 10L);

        UserDTO result = cache.getUser(1L);
        assertSame(cached, result);
        verify(userClient, never()).getUser(anyLong());
    }

    @Test
    void getUser_shouldFetchAndCacheOnMiss() {
        UserServiceFeignClient userClient = mock(UserServiceFeignClient.class);
        @SuppressWarnings("unchecked")
        RedisTemplate<Object, Object> redisTemplate = (RedisTemplate<Object, Object>) mock(RedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<Object, Object> ops = (ValueOperations<Object, Object>) mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(ops);
        when(ops.get(anyString())).thenReturn(null);

        UserDTO fetched = UserDTO.builder().id("2").username("u2").build();
        when(userClient.getUser(2L)).thenReturn(fetched);

        UserProfileCache cache = new UserProfileCache(redisTemplate, userClient);
        ReflectionTestUtils.setField(cache, "userCacheKeyPrefix", "user:brief:");
        ReflectionTestUtils.setField(cache, "userCacheTtlMinutes", 10L);

        UserDTO result = cache.getUser(2L);
        assertSame(fetched, result);
        verify(ops).set(eq("user:brief:2"), eq(fetched), eq(10L), eq(TimeUnit.MINUTES));
    }

    @Test
    void getUser_shouldReturnNullWhenUserIdNull() {
        UserServiceFeignClient userClient = mock(UserServiceFeignClient.class);
        @SuppressWarnings("unchecked")
        RedisTemplate<Object, Object> redisTemplate = (RedisTemplate<Object, Object>) mock(RedisTemplate.class);

        UserProfileCache cache = new UserProfileCache(redisTemplate, userClient);
        assertNull(cache.getUser(null));
    }

    @Test
    void getUser_shouldHandleRedisGetException() {
        UserServiceFeignClient userClient = mock(UserServiceFeignClient.class);
        @SuppressWarnings("unchecked")
        RedisTemplate<Object, Object> redisTemplate = (RedisTemplate<Object, Object>) mock(RedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<Object, Object> ops = (ValueOperations<Object, Object>) mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(ops);
        when(ops.get(anyString())).thenThrow(new RuntimeException("redis read failed"));

        UserDTO fetched = UserDTO.builder().id("3").username("u3").build();
        when(userClient.getUser(3L)).thenReturn(fetched);

        UserProfileCache cache = new UserProfileCache(redisTemplate, userClient);
        ReflectionTestUtils.setField(cache, "userCacheKeyPrefix", "user:brief:");
        ReflectionTestUtils.setField(cache, "userCacheTtlMinutes", 10L);

        UserDTO result = cache.getUser(3L);
        assertSame(fetched, result);
        verify(ops).set(eq("user:brief:3"), eq(fetched), eq(10L), eq(TimeUnit.MINUTES));
    }

    @Test
    void getUser_shouldHandleRedisSetException() {
        UserServiceFeignClient userClient = mock(UserServiceFeignClient.class);
        @SuppressWarnings("unchecked")
        RedisTemplate<Object, Object> redisTemplate = (RedisTemplate<Object, Object>) mock(RedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<Object, Object> ops = (ValueOperations<Object, Object>) mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(ops);
        when(ops.get(anyString())).thenReturn(null);
        doThrow(new RuntimeException("redis write failed")).when(ops).set(anyString(), any(), anyLong(), any(TimeUnit.class));

        UserDTO fetched = UserDTO.builder().id("4").username("u4").build();
        when(userClient.getUser(4L)).thenReturn(fetched);

        UserProfileCache cache = new UserProfileCache(redisTemplate, userClient);
        ReflectionTestUtils.setField(cache, "userCacheKeyPrefix", "user:brief:");
        ReflectionTestUtils.setField(cache, "userCacheTtlMinutes", 10L);

        assertDoesNotThrow(() -> cache.getUser(4L));
        verify(userClient).getUser(4L);
    }

    @Test
    void getUser_shouldIgnoreNonUserDtoCacheValue() {
        UserServiceFeignClient userClient = mock(UserServiceFeignClient.class);
        @SuppressWarnings("unchecked")
        RedisTemplate<Object, Object> redisTemplate = (RedisTemplate<Object, Object>) mock(RedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<Object, Object> ops = (ValueOperations<Object, Object>) mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(ops);
        when(ops.get("user:brief:5")).thenReturn("not-user-dto");

        UserDTO fetched = UserDTO.builder().id("5").username("u5").build();
        when(userClient.getUser(5L)).thenReturn(fetched);

        UserProfileCache cache = new UserProfileCache(redisTemplate, userClient);
        ReflectionTestUtils.setField(cache, "userCacheKeyPrefix", "user:brief:");
        ReflectionTestUtils.setField(cache, "userCacheTtlMinutes", 10L);

        UserDTO result = cache.getUser(5L);
        assertSame(fetched, result);
        verify(userClient).getUser(5L);
    }

    @Test
    void getUser_shouldReturnNullWhenFeignReturnsNull() {
        UserServiceFeignClient userClient = mock(UserServiceFeignClient.class);
        @SuppressWarnings("unchecked")
        RedisTemplate<Object, Object> redisTemplate = (RedisTemplate<Object, Object>) mock(RedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<Object, Object> ops = (ValueOperations<Object, Object>) mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(ops);
        when(ops.get(anyString())).thenReturn(null);

        when(userClient.getUser(6L)).thenReturn(null);

        UserProfileCache cache = new UserProfileCache(redisTemplate, userClient);
        ReflectionTestUtils.setField(cache, "userCacheKeyPrefix", "user:brief:");
        ReflectionTestUtils.setField(cache, "userCacheTtlMinutes", 10L);

        assertNull(cache.getUser(6L));
        verify(ops, never()).set(anyString(), any(), anyLong(), any(TimeUnit.class));
    }
}
