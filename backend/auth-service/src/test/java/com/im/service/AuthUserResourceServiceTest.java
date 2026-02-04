package com.im.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.AuthUserResourceDTO;
import com.im.dto.request.IssueTokenRequest;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

public class AuthUserResourceServiceTest {

    @Test
    void upsertFromIssueTokenRequest_shouldWriteCache() throws Exception {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> ops = (ValueOperations<String, String>) mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(ops);

        ObjectMapper objectMapper = new ObjectMapper();
        AuthUserResourceService service = new AuthUserResourceService(redisTemplate, objectMapper);
        ReflectionTestUtils.setField(service, "resourceCacheTtlSeconds", 60L);

        IssueTokenRequest req = new IssueTokenRequest();
        req.setUserId(1L);
        req.setUsername("u1");
        req.setNickname("n1");
        req.setAvatar("a1");
        req.setEmail("e1@example.com");
        req.setPhone("+8613711112222");

        service.upsertFromIssueTokenRequest(req);

        ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> valCaptor = ArgumentCaptor.forClass(String.class);
        verify(ops).set(keyCaptor.capture(), valCaptor.capture(), eq(Duration.ofSeconds(60L)));

        assertEquals("auth:user:1", keyCaptor.getValue());
        AuthUserResourceDTO dto = objectMapper.readValue(valCaptor.getValue(), AuthUserResourceDTO.class);
        assertEquals(1L, dto.getUserId());
        assertEquals("u1", dto.getUsername());
        assertNotNull(dto.getUserInfo());
        assertEquals("n1", ((Map<?, ?>) dto.getUserInfo()).get("nickname"));
    }

    @Test
    void getOrLoad_shouldReturnCachedValueWhenPresent() throws Exception {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> ops = (ValueOperations<String, String>) mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(ops);

        ObjectMapper objectMapper = new ObjectMapper();
        AuthUserResourceService service = new AuthUserResourceService(redisTemplate, objectMapper);
        ReflectionTestUtils.setField(service, "resourceCacheTtlSeconds", 60L);

        AuthUserResourceDTO cached = new AuthUserResourceDTO();
        cached.setUserId(2L);
        cached.setUsername("u2");
        cached.setUserInfo(Map.of("id", 2L, "username", "u2"));

        when(ops.get("auth:user:2")).thenReturn(objectMapper.writeValueAsString(cached));

        AuthUserResourceDTO result = service.getOrLoad(2L);
        assertEquals(2L, result.getUserId());
        assertEquals("u2", result.getUsername());
        verify(redisTemplate).expire(eq("auth:user:2"), eq(Duration.ofSeconds(60L)));
    }

    @Test
    void getOrLoad_shouldThrowWhenUserIdNull() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        ObjectMapper objectMapper = new ObjectMapper();
        AuthUserResourceService service = new AuthUserResourceService(redisTemplate, objectMapper);

        assertThrows(IllegalArgumentException.class, () -> service.getOrLoad(null));
    }

    @Test
    void getOrLoad_shouldReturnEmptyWhenCacheInvalidJson() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> ops = (ValueOperations<String, String>) mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(ops);

        ObjectMapper objectMapper = new ObjectMapper();
        AuthUserResourceService service = new AuthUserResourceService(redisTemplate, objectMapper);
        when(ops.get("auth:user:3")).thenReturn("{not-json");

        AuthUserResourceDTO dto = service.getOrLoad(3L);
        assertEquals(3L, dto.getUserId());
        assertNotNull(dto.getUserInfo());
        assertTrue(dto.getUserInfo().isEmpty());
    }

    @Test
    void getOrLoad_shouldReturnCachedEvenIfExpireFails() throws Exception {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> ops = (ValueOperations<String, String>) mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(ops);

        ObjectMapper objectMapper = new ObjectMapper();
        AuthUserResourceService service = new AuthUserResourceService(redisTemplate, objectMapper);
        ReflectionTestUtils.setField(service, "resourceCacheTtlSeconds", 60L);

        AuthUserResourceDTO cached = new AuthUserResourceDTO();
        cached.setUserId(4L);
        cached.setUsername("u4");
        when(ops.get("auth:user:4")).thenReturn(objectMapper.writeValueAsString(cached));
        when(redisTemplate.expire(anyString(), any(Duration.class))).thenThrow(new RuntimeException("boom"));

        AuthUserResourceDTO result = service.getOrLoad(4L);
        assertEquals(4L, result.getUserId());
        assertEquals("u4", result.getUsername());
    }

    @Test
    void upsertFromIssueTokenRequest_shouldNoopWhenRequestNull() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> ops = (ValueOperations<String, String>) mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(ops);

        ObjectMapper objectMapper = new ObjectMapper();
        AuthUserResourceService service = new AuthUserResourceService(redisTemplate, objectMapper);

        service.upsertFromIssueTokenRequest(null);
        verify(ops, never()).set(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void upsertFromIssueTokenRequest_shouldSwallowRedisErrors() throws Exception {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> ops = (ValueOperations<String, String>) mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(ops);
        doThrow(new RuntimeException("redis down")).when(ops).set(anyString(), anyString(), any(Duration.class));

        ObjectMapper objectMapper = new ObjectMapper();
        AuthUserResourceService service = new AuthUserResourceService(redisTemplate, objectMapper);
        ReflectionTestUtils.setField(service, "resourceCacheTtlSeconds", 60L);

        IssueTokenRequest req = new IssueTokenRequest();
        req.setUserId(5L);
        req.setUsername("u5");

        assertDoesNotThrow(() -> service.upsertFromIssueTokenRequest(req));
    }
}
