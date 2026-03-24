package com.im.service.support;

import com.im.dto.UserDTO;
import com.im.feign.UserServiceFeignClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@RequiredArgsConstructor
public class UserProfileCache {

    private final RedisTemplate<String, Object> redisTemplate;
    private final UserServiceFeignClient userServiceFeignClient;

    @Value("${im.message.user-cache.key-prefix:user:brief:}")
    private String userCacheKeyPrefix;

    @Value("${im.message.user-cache.ttl-minutes:10}")
    private long userCacheTtlMinutes;

    public UserDTO getUser(Long userId) {
        if (userId == null) {
            return null;
        }
        String key = userCacheKeyPrefix + userId;
        try {
            Object cached = redisTemplate.opsForValue().get(key);
            if (cached instanceof UserDTO dto) {
                return dto;
            }
        } catch (Exception e) {
            log.debug("读取用户缓存失败，userId={}", userId, e);
        }

        UserDTO dto = userServiceFeignClient.getUser(userId);
        if (dto != null) {
            try {
                redisTemplate.opsForValue().set(key, dto, userCacheTtlMinutes, TimeUnit.MINUTES);
            } catch (Exception e) {
                log.debug("写入用户缓存失败，userId={}", userId, e);
            }
        }
        return dto;
    }
}

