package com.im;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(scanBasePackages = "com.im")
@EnableFeignClients(basePackages = "com.im.feign")
@EnableScheduling
@MapperScan("com.im.mapper")
public class MessageServiceApplication {
    public static void main(String[] args) {
        System.setProperty("nacos.logging.default.config.enabled",
                System.getProperty("nacos.logging.default.config.enabled", "false"));
        SpringApplication.run(MessageServiceApplication.class, args);
    }
}
