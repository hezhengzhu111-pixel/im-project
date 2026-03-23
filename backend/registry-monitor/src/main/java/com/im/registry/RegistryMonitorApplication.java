package com.im.registry;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@EnableScheduling
@EnableDiscoveryClient
@SpringBootApplication
public class RegistryMonitorApplication {

    public static void main(String[] args) {
        SpringApplication.run(RegistryMonitorApplication.class, args);
    }
}

