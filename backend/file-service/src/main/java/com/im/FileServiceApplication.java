package com.im;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

@SpringBootApplication(scanBasePackages = "com.im")
@EnableFeignClients(basePackages = "com.im.feign")
public class FileServiceApplication {
    public static void main(String[] args) {
        System.setProperty("nacos.logging.default.config.enabled",
                System.getProperty("nacos.logging.default.config.enabled", "false"));
        SpringApplication.run(FileServiceApplication.class, args);
    }
}
