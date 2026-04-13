package com.im.log;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.context.annotation.ComponentScan;

@SpringBootApplication
@EnableDiscoveryClient
@ComponentScan(basePackages = {"com.im.log", "com.im.config", "com.im.exception", "com.im.interceptor"})
public class LogServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(LogServiceApplication.class, args);
    }
}
