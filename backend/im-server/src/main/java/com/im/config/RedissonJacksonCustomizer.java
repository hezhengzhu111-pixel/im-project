package com.im.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.redisson.codec.JsonJacksonCodec;
import org.redisson.config.Config;
import org.redisson.spring.starter.RedissonAutoConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@RequiredArgsConstructor
public class RedissonJacksonCustomizer {

    private final ObjectMapper objectMapper;

    @Bean
    public RedissonAutoConfigurationCustomizer redissonAutoConfigurationCustomizer() {
        return new RedissonAutoConfigurationCustomizer() {
            @Override
            public void customize(Config config) {
                config.setCodec(new JsonJacksonCodec(objectMapper.copy()));
            }
        };
    }
}
