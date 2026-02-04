package com.im.utils;

import cn.hutool.core.lang.Snowflake;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 雪花算法ID生成器工具类
 */
@Component
public class SnowflakeIdGenerator {

    @Autowired
    private Snowflake snowflake;

    /**
     * 生成下一个ID
     * @return 雪花算法生成的ID
     */
    public Long nextId() {
        return snowflake.nextId();
    }

    /**
     * 生成下一个ID的字符串形式
     * @return 雪花算法生成的ID字符串
     */
    public String nextIdStr() {
        return String.valueOf(snowflake.nextId());
    }
}