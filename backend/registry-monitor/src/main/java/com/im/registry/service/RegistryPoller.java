package com.im.registry.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.registry.config.RegistryMonitorProperties;
import com.im.registry.model.RegistryAlert;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Component
@RequiredArgsConstructor
public class RegistryPoller {

    private final RegistryMonitorProperties properties;
    private final ObjectMapper objectMapper;
    private final MeterRegistry meterRegistry;

    private final RegistryState state = new RegistryState();
    private final Map<String, AtomicInteger> gauges = new ConcurrentHashMap<>();

    @Scheduled(fixedDelayString = "${im.registry-monitor.poll.interval-ms:5000}")
    public void poll() {
        try {
            String baseUrl = properties.getNacos().getBaseUrl();
            RestClient client = RestClient.builder().baseUrl(baseUrl).build();

            pollHealth(client);
            pollInstances(client);

            state.markPollSuccess();
        } catch (Exception e) {
            state.markPollFailure(e);
            log.warn("注册中心轮询失败: {}", e.getMessage(), e);
        }
    }

    private void pollHealth(RestClient client) throws Exception {
        try {
            String body = client.get()
                    .uri("/v1/console/health")
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(String.class);
            if (body == null || body.isBlank()) {
                throw new IllegalStateException("注册中心健康检查返回为空");
            }
        } catch (Exception e) {
            log.warn("Nacos health check failed, but continuing instance poll. Error: {}", e.getMessage());
        }
    }

    private void pollInstances(RestClient client) throws Exception {
        String servicesJson = client.get()
                .uri(uriBuilder -> uriBuilder.path("/v1/ns/catalog/services")
                        .queryParam("pageNo", 1)
                        .queryParam("pageSize", 1000)
                        .build())
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .body(String.class);

        JsonNode servicesRoot = objectMapper.readTree(servicesJson);
        JsonNode serviceListNode = servicesRoot.get("serviceList");
        if (serviceListNode == null || !serviceListNode.isArray()) {
            return;
        }

        Map<String, Set<String>> newInstancesByService = new HashMap<>();
        Map<String, Integer> newCountsByService = new HashMap<>();

        for (JsonNode serviceNode : serviceListNode) {
            String raw = serviceNode.asText();
            ServiceKey serviceKey = ServiceKey.parse(raw);
            if (serviceKey.serviceName == null || serviceKey.serviceName.isEmpty()) {
                continue;
            }

            String instanceJson = client.get()
                    .uri(uriBuilder -> uriBuilder.path("/v1/ns/instance/list")
                            .queryParam("serviceName", serviceKey.serviceName)
                            .queryParam("groupName", serviceKey.groupName)
                            .queryParam("healthyOnly", false)
                            .build())
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(String.class);

            JsonNode instanceRoot = objectMapper.readTree(instanceJson);
            JsonNode hosts = instanceRoot.get("hosts");

            Set<String> instances = new HashSet<>();
            if (hosts != null && hosts.isArray()) {
                for (JsonNode host : hosts) {
                    String ip = host.path("ip").asText(null);
                    int port = host.path("port").asInt(-1);
                    if (ip != null && port > 0) {
                        instances.add(ip + ":" + port);
                    }
                }
            }

            String serviceName = serviceKey.serviceName;
            newInstancesByService.put(serviceName, instances);
            newCountsByService.put(serviceName, instances.size());

            updateMetrics(serviceName, instances.size());
        }

        diffAndLog(newInstancesByService, newCountsByService);
    }

    private void updateMetrics(String serviceName, int count) {
        AtomicInteger gauge = gauges.computeIfAbsent(serviceName, name -> {
            AtomicInteger value = new AtomicInteger(0);
            Gauge.builder("nacos_service_instance_count", value, AtomicInteger::get)
                    .tag("service", name)
                    .register(meterRegistry);
            return value;
        });
        gauge.set(count);
    }

    private void diffAndLog(Map<String, Set<String>> newInstancesByService, Map<String, Integer> newCountsByService) {
        for (Map.Entry<String, Set<String>> entry : newInstancesByService.entrySet()) {
            String service = entry.getKey();
            Set<String> next = entry.getValue();
            Set<String> prev = state.getInstancesByService().getOrDefault(service, Set.of());

            if (!prev.isEmpty() || !next.isEmpty()) {
                Set<String> added = new HashSet<>(next);
                added.removeAll(prev);
                Set<String> removed = new HashSet<>(prev);
                removed.removeAll(next);

                for (String ins : added) {
                    log.info("服务注册: service={}, instance={}", service, ins);
                }
                for (String ins : removed) {
                    log.info("服务注销: service={}, instance={}", service, ins);
                }
            }

            int prevCount = state.getCountsByService().getOrDefault(service, 0);
            int currCount = newCountsByService.getOrDefault(service, 0);
            state.getCountsByService().put(service, currCount);
            state.getInstancesByService().put(service, next);

            double threshold = properties.getAlert().getFluctuationThreshold();
            if (prevCount > 0 && threshold > 0) {
                double ratio = Math.abs(currCount - prevCount) / (double) prevCount;
                if (ratio > threshold) {
                    String msg = String.format("实例数波动超过阈值: service=%s prev=%d curr=%d ratio=%.4f threshold=%.4f",
                            service, prevCount, currCount, ratio, threshold);
                    log.warn(msg);
                    state.addAlert(new RegistryAlert(Instant.now(), service, prevCount, currCount, ratio, msg));
                }
            }
        }
    }

    public RegistryState getState() {
        return state;
    }

    private record ServiceKey(String groupName, String serviceName) {
        static ServiceKey parse(String raw) {
            if (raw == null) {
                return new ServiceKey("DEFAULT_GROUP", "");
            }
            String[] parts = raw.split("@@");
            if (parts.length == 2) {
                return new ServiceKey(parts[0], parts[1]);
            }
            return new ServiceKey("DEFAULT_GROUP", raw);
        }
    }
}

