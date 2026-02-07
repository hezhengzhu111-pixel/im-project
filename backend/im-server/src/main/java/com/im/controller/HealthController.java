package com.im.controller;

import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class HealthController {

    private final ApplicationAvailability availability;
    private final KafkaListenerEndpointRegistry kafkaRegistry;

    public HealthController(ApplicationAvailability availability, KafkaListenerEndpointRegistry kafkaRegistry) {
        this.availability = availability;
        this.kafkaRegistry = kafkaRegistry;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "UP");
        body.put("service", "im-server");
        body.put("time", Instant.now().toString());
        return body;
    }

    @GetMapping("/ready")
    public ResponseEntity<Map<String, Object>> ready() {
        boolean acceptingTraffic = availability.getReadinessState() == ReadinessState.ACCEPTING_TRAFFIC;
        boolean kafkaRunning = true;
        for (MessageListenerContainer container : kafkaRegistry.getListenerContainers()) {
            if (!container.isRunning()) {
                kafkaRunning = false;
                break;
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("service", "im-server");
        body.put("time", Instant.now().toString());
        body.put("readinessState", availability.getReadinessState().name());
        body.put("kafkaListenersRunning", kafkaRunning);

        if (acceptingTraffic && kafkaRunning) {
            body.put("status", "READY");
            return ResponseEntity.ok(body);
        }
        body.put("status", "NOT_READY");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }
}

