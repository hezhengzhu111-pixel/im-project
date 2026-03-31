package com.im;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableScheduling;

import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;

/**
 * 即时通讯服务器启动类
 * 提供完整的IM基础服务平台，支持集群路由与实时消息推送
 * 
 * @author IM Team
 * @version 2.0.0
 */
@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})
// 启用定时任务支持
@EnableScheduling
// 启用Feign客户端支持
@EnableFeignClients
public class ImServerApplication {

    /**
     * 应用程序主入口
     * 启动Spring Boot应用并输出服务信息
     */
    public static void main(String[] args) {
        SpringApplication.run(ImServerApplication.class, args);
        
        // 输出服务启动成功信息
        System.out.println("========================================");
        System.out.println("IM即时通讯服务器 v2.0.0 启动成功！");
        System.out.println("========================================");
        System.out.println("支持的服务调用方式:");
        System.out.println("1. REST API接口: http://localhost:8080/api/im");
        System.out.println("2. WebSocket连接: ws://localhost:8080/websocket/{userId}");
        System.out.println("3. Redis Pub/Sub 推送通道: im:ws:push:{instanceId}");
        System.out.println("4. Feign远程调用: ImServiceFeign");
        System.out.println("========================================");
    }
}
