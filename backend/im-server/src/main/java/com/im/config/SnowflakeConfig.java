package com.im.config;

import cn.hutool.core.lang.Snowflake;
import cn.hutool.core.util.IdUtil;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 雪花算法ID生成器配置
 */
@Configuration
public class SnowflakeConfig {

    /**
     * 雪花算法ID生成器
     * workerId: 工作机器ID (0-31)
     * datacenterId: 数据中心ID (0-31)
     */
    @Bean
    public Snowflake snowflake() {
        // 可以根据实际部署环境配置不同的workerId和datacenterId
        return IdUtil.getSnowflake(1, 1);
    }
}