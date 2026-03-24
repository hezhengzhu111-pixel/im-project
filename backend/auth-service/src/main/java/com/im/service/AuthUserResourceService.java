package com.im.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.AuthUserResourceDTO;
import com.im.dto.request.IssueTokenRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthUserResourceService {

    private static final String USER_RESOURCE_KEY_PREFIX = "auth:user:";

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${auth.resource-cache.ttl-seconds:604800}")
    private long resourceCacheTtlSeconds;

    public AuthUserResourceDTO getOrLoad(Long userId) {
        if (userId == null) {
            throw new IllegalArgumentException("userId不能为空");
        }
        String key = USER_RESOURCE_KEY_PREFIX + userId;
        String cached = stringRedisTemplate.opsForValue().get(key);
        if (cached != null && !cached.isEmpty()) {
            try {
                AuthUserResourceDTO dto = objectMapper.readValue(cached, AuthUserResourceDTO.class);
                if (dto != null && dto.getUserId() != null) {
                    try {
                        stringRedisTemplate.expire(key, Duration.ofSeconds(resourceCacheTtlSeconds));
                    } catch (Exception e) {
                        log.debug("延长用户资源缓存TTL失败，userId={}", userId, e);
                    }
                }
                return dto;
            } catch (Exception e) {
                log.warn("解析用户资源缓存失败，userId={}", userId, e);
            }
        }
        return emptyUserResource(userId);
    }

    public void upsertFromIssueTokenRequest(IssueTokenRequest request) {
        if (request == null || request.getUserId() == null) {
            return;
        }
        Long userId = request.getUserId();
        String key = USER_RESOURCE_KEY_PREFIX + userId;

        AuthUserResourceDTO dto = new AuthUserResourceDTO();
        dto.setUserId(userId);
        dto.setUsername(request.getUsername());
        dto.setResourcePermissions(Collections.emptyList());
        dto.setDataScopes(Collections.emptyMap());
        dto.setUserInfo(buildUserInfo(request));

        try {
            String json = objectMapper.writeValueAsString(dto);
            stringRedisTemplate.opsForValue().set(key, json, Duration.ofSeconds(resourceCacheTtlSeconds));
        } catch (Exception e) {
            log.warn("写入用户资源缓存失败，userId={}", userId, e);
        }
    }

    private AuthUserResourceDTO emptyUserResource(Long userId) {
        AuthUserResourceDTO dto = new AuthUserResourceDTO();
        dto.setUserId(userId);
        dto.setResourcePermissions(Collections.emptyList());
        dto.setDataScopes(Collections.emptyMap());
        dto.setUserInfo(Collections.emptyMap());
        return dto;
    }

    private Map<String, Object> buildUserInfo(IssueTokenRequest user) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", user.getUserId());
        map.put("username", user.getUsername());
        map.put("nickname", user.getNickname());
        map.put("avatar", user.getAvatar());
        map.put("email", user.getEmail());
        map.put("phone", user.getPhone());
        return map;
    }
}
