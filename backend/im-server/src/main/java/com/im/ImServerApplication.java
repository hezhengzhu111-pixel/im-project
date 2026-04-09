package com.im;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})
@EnableScheduling
@EnableFeignClients
@EnableDiscoveryClient
public class ImServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(ImServerApplication.class, args);

        System.out.println("========================================");
        System.out.println("IM server started successfully.");
        System.out.println("========================================");
        System.out.println("1. REST API: http://localhost:8080/api/im");
        System.out.println("2. WebSocket: ws://localhost:8080/websocket/{userId}");
        System.out.println("3. Redisson topic: im:channel:{instanceId}");
        System.out.println("4. Feign client: ImServiceFeign");
        System.out.println("========================================");
    }
}
