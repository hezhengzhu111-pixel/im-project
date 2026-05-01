package com.im.ai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
public class AiApplication {

    public static void main(String[] args) {
        SpringApplication.run(AiApplication.class, args);
    }

    @RestController
    static class HealthController {

        @GetMapping("/health")
        public String health() {
            return "{\"status\":\"UP\",\"service\":\"spring-ai\"}";
        }

        @GetMapping("/ready")
        public String ready() {
            return "{\"status\":\"READY\",\"service\":\"spring-ai\"}";
        }
    }
}
