package com.im.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
@RequestMapping("/test")
public class TestController {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @GetMapping("/create-table")
    public Map<String, Object> createTable() {
        String sql = "CREATE TABLE IF NOT EXISTS user_settings (" +
                "user_id BIGINT NOT NULL COMMENT '用户ID'," +
                "privacy_settings JSON NULL COMMENT '隐私设置'," +
                "message_settings JSON NULL COMMENT '消息设置'," +
                "general_settings JSON NULL COMMENT '通用设置'," +
                "created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "PRIMARY KEY (user_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户设置表';";
        jdbcTemplate.execute(sql);
        return Map.of("message", "Table user_settings created successfully!");
    }

    @GetMapping("/hello")
    public Map<String, Object> hello() {
        return Map.of("message", "Hello from TestController!");
    }

    @PostMapping("/login")
    public Map<String, Object> testLogin() {
        return Map.of("message", "Test login works!");
    }
}
