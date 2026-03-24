package com.im;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.mybatis.spring.annotation.MapperScan;

@SpringBootApplication(scanBasePackages = "com.im")
@EnableFeignClients(basePackages = "com.im.feign")
@MapperScan("com.im.mapper")
public class GroupServiceApplication {
    public static void main(String[] args) {
        System.setProperty("nacos.logging.default.config.enabled",
                System.getProperty("nacos.logging.default.config.enabled", "false"));
        SpringApplication.run(GroupServiceApplication.class, args);
    }
}
