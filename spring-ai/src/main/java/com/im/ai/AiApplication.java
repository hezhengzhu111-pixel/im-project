package com.im.ai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;

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

    @RestController
    static class TestKeyController {

        private static final Map<String, String> PROVIDER_URLS = Map.of(
                "deepseek", "https://api.deepseek.com/v1",
                "openai", "https://api.openai.com/v1",
                "minimax", "https://api.minimax.chat/v1"
        );

        @PostMapping("/api/ai/internal/test-key")
        public ResponseEntity<Map<String, Object>> testKey(@RequestBody Map<String, String> body) {
            String provider = body.getOrDefault("provider", "deepseek").toLowerCase();
            String apiKey = body.getOrDefault("apiKey", "");
            String baseUrl = PROVIDER_URLS.getOrDefault(provider, "https://api.deepseek.com/v1");

            if (apiKey.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of(
                        "status", "error",
                        "message", "API key is empty"
                ));
            }

            try {
                var request = Map.of(
                        "model", "deepseek-chat",
                        "messages", java.util.List.of(
                                Map.of("role", "user", "content", "hi")
                        ),
                        "max_tokens", 5
                );

                WebClient.create(baseUrl)
                        .post()
                        .uri("/chat/completions")
                        .header("Authorization", "Bearer " + apiKey)
                        .header("Content-Type", "application/json")
                        .bodyValue(request)
                        .retrieve()
                        .toBodilessEntity()
                        .block(java.time.Duration.ofSeconds(10));

                return ResponseEntity.ok(Map.of("status", "ok"));
            } catch (Exception e) {
                String msg = e.getMessage();
                if (msg == null) msg = "unknown error";
                if (msg.contains("401") || msg.contains("403")) {
                    return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                            "status", "invalid",
                            "message", "API key rejected"
                    ));
                }
                if (msg.contains("402")) {
                    return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(Map.of(
                            "status", "insufficient",
                            "message", "Insufficient balance"
                    ));
                }
                return ResponseEntity.ok(Map.of("status", "error",
                        "message", "Connection failed: " + msg));
            }
        }
    }
}
