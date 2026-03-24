package com.im.config;

import cn.hutool.core.lang.Snowflake;
import cn.hutool.core.util.IdUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SnowflakeConfig {

    @Bean
    public Snowflake snowflake(
            @Value("${im.snowflake.worker-id:1}") long workerId,
            @Value("${im.snowflake.datacenter-id:1}") long datacenterId) {
        return IdUtil.getSnowflake(workerId, datacenterId);
    }
}
