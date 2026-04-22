package com.im.config;

import com.im.dto.MessageEvent;
import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.support.serializer.JsonDeserializer;
import org.springframework.kafka.support.serializer.JsonSerializer;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Configuration
@RequiredArgsConstructor
public class GatewayKafkaMessageEventConfig {

    static final String ROUTING_MODE_INSTANCE = "instance";
    static final String ROUTING_MODE_LOCAL_FILTER = "local-session";
    private static final String DEFAULT_ROUTER_GROUP_ID = "im-ws-pusher-router";
    private static final String DEFAULT_DISPATCH_GROUP_ID_PREFIX = "im-ws-pusher-dispatch";

    private final ImNodeIdentity nodeIdentity;

    @Value("${im.kafka.push-routing-mode:" + ROUTING_MODE_INSTANCE + "}")
    private String pushRoutingMode;

    @Value("${spring.kafka.consumer.group-id:}")
    private String configuredPushConsumerGroupId;

    @PostConstruct
    public void validateConfiguration() {
        validatePushRoutingMode(pushRoutingMode, configuredPushConsumerGroupId);
    }

    @Bean
    public KafkaTemplate<String, Object> gatewayRoutedEventKafkaTemplate(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers) {
        return new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(producerProperties(bootstrapServers)));
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, MessageEvent> gatewayMessageEventKafkaListenerContainerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${spring.kafka.consumer.group-id:}") String configuredGroupId,
            @Value("${spring.kafka.consumer.auto-offset-reset:earliest}") String autoOffsetReset,
            @Value("${spring.kafka.consumer.max-poll-records:100}") Integer maxPollRecords,
            @Value("${im.kafka.consumer.concurrency:3}") Integer concurrency,
            @Value("${im.kafka.consumer.poll-timeout:1000}") Long pollTimeout) {
        return singleRecordFactory(
                bootstrapServers,
                resolveRouterGroupId(configuredGroupId),
                autoOffsetReset,
                maxPollRecords,
                concurrency,
                pollTimeout,
                MessageEvent.class
        );
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, ReadEvent> gatewayReadEventKafkaListenerContainerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${spring.kafka.consumer.group-id:}") String configuredGroupId,
            @Value("${spring.kafka.consumer.auto-offset-reset:earliest}") String autoOffsetReset,
            @Value("${spring.kafka.consumer.max-poll-records:100}") Integer maxPollRecords,
            @Value("${im.kafka.consumer.concurrency:3}") Integer concurrency,
            @Value("${im.kafka.consumer.poll-timeout:1000}") Long pollTimeout) {
        return singleRecordFactory(
                bootstrapServers,
                resolveRouterGroupId(configuredGroupId),
                autoOffsetReset,
                maxPollRecords,
                concurrency,
                pollTimeout,
                ReadEvent.class
        );
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, StatusChangeEvent> gatewayStatusChangeEventKafkaListenerContainerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${spring.kafka.consumer.group-id:}") String configuredGroupId,
            @Value("${spring.kafka.consumer.auto-offset-reset:earliest}") String autoOffsetReset,
            @Value("${spring.kafka.consumer.max-poll-records:100}") Integer maxPollRecords,
            @Value("${im.kafka.consumer.concurrency:3}") Integer concurrency,
            @Value("${im.kafka.consumer.poll-timeout:1000}") Long pollTimeout) {
        return singleRecordFactory(
                bootstrapServers,
                resolveRouterGroupId(configuredGroupId),
                autoOffsetReset,
                maxPollRecords,
                concurrency,
                pollTimeout,
                StatusChangeEvent.class
        );
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, MessageEvent> gatewayRoutedMessageEventKafkaListenerContainerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${spring.kafka.consumer.group-id:}") String configuredGroupId,
            @Value("${spring.kafka.consumer.auto-offset-reset:earliest}") String autoOffsetReset,
            @Value("${spring.kafka.consumer.max-poll-records:100}") Integer maxPollRecords,
            @Value("${im.kafka.consumer.concurrency:3}") Integer concurrency,
            @Value("${im.kafka.consumer.poll-timeout:1000}") Long pollTimeout) {
        return singleRecordFactory(
                bootstrapServers,
                resolveDispatchGroupId(configuredGroupId),
                autoOffsetReset,
                maxPollRecords,
                concurrency,
                pollTimeout,
                MessageEvent.class
        );
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, ReadEvent> gatewayRoutedReadEventKafkaListenerContainerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${spring.kafka.consumer.group-id:}") String configuredGroupId,
            @Value("${spring.kafka.consumer.auto-offset-reset:earliest}") String autoOffsetReset,
            @Value("${spring.kafka.consumer.max-poll-records:100}") Integer maxPollRecords,
            @Value("${im.kafka.consumer.concurrency:3}") Integer concurrency,
            @Value("${im.kafka.consumer.poll-timeout:1000}") Long pollTimeout) {
        return singleRecordFactory(
                bootstrapServers,
                resolveDispatchGroupId(configuredGroupId),
                autoOffsetReset,
                maxPollRecords,
                concurrency,
                pollTimeout,
                ReadEvent.class
        );
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, StatusChangeEvent> gatewayRoutedStatusChangeEventKafkaListenerContainerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${spring.kafka.consumer.group-id:}") String configuredGroupId,
            @Value("${spring.kafka.consumer.auto-offset-reset:earliest}") String autoOffsetReset,
            @Value("${spring.kafka.consumer.max-poll-records:100}") Integer maxPollRecords,
            @Value("${im.kafka.consumer.concurrency:3}") Integer concurrency,
            @Value("${im.kafka.consumer.poll-timeout:1000}") Long pollTimeout) {
        return singleRecordFactory(
                bootstrapServers,
                resolveDispatchGroupId(configuredGroupId),
                autoOffsetReset,
                maxPollRecords,
                concurrency,
                pollTimeout,
                StatusChangeEvent.class
        );
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String> gatewayAuthorizationCacheInvalidationKafkaListenerContainerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${im.kafka.authz-cache.consumer-group-id:}") String configuredGroupId,
            @Value("${spring.kafka.consumer.auto-offset-reset:earliest}") String autoOffsetReset,
            @Value("${spring.kafka.consumer.max-poll-records:100}") Integer maxPollRecords,
            @Value("${im.kafka.consumer.concurrency:3}") Integer concurrency,
            @Value("${im.kafka.consumer.poll-timeout:1000}") Long pollTimeout) {
        ConcurrentKafkaListenerContainerFactory<String, String> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(new DefaultKafkaConsumerFactory<>(
                stringConsumerProperties(bootstrapServers, configuredGroupId, autoOffsetReset, maxPollRecords),
                new StringDeserializer(),
                new StringDeserializer()
        ));
        factory.setConcurrency(Math.max(1, concurrency == null ? 1 : concurrency));
        factory.getContainerProperties().setPollTimeout(Math.max(100L, pollTimeout == null ? 1000L : pollTimeout));
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.RECORD);
        return factory;
    }

    void validatePushRoutingMode(String routingMode, String configuredGroupId) {
        String normalizedMode = normalizeRoutingMode(routingMode);
        if (ROUTING_MODE_INSTANCE.equals(normalizedMode)) {
            return;
        }
        if (ROUTING_MODE_LOCAL_FILTER.equals(normalizedMode) && StringUtils.hasText(configuredGroupId)) {
            throw new IllegalStateException("shared Kafka consumer group is not allowed with local-session routing mode");
        }
        throw new IllegalStateException("unsupported Kafka push routing mode: " + normalizedMode);
    }

    String resolveRouterGroupId(String configuredGroupId) {
        if (StringUtils.hasText(configuredGroupId)) {
            return configuredGroupId.trim();
        }
        return DEFAULT_ROUTER_GROUP_ID;
    }

    String resolveDispatchGroupId(String configuredGroupId) {
        String sanitizedInstanceId = sanitizeInstanceId(nodeIdentity == null ? null : nodeIdentity.getInstanceId());
        if (StringUtils.hasText(configuredGroupId)) {
            return configuredGroupId.trim() + ".dispatch." + sanitizedInstanceId;
        }
        return DEFAULT_DISPATCH_GROUP_ID_PREFIX + "." + sanitizedInstanceId;
    }

    private <T> ConcurrentKafkaListenerContainerFactory<String, T> singleRecordFactory(
            String bootstrapServers,
            String groupId,
            String autoOffsetReset,
            Integer maxPollRecords,
            Integer concurrency,
            Long pollTimeout,
            Class<T> valueType) {
        ConcurrentKafkaListenerContainerFactory<String, T> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(new DefaultKafkaConsumerFactory<>(
                consumerProperties(bootstrapServers, groupId, autoOffsetReset, maxPollRecords, valueType),
                new StringDeserializer(),
                jsonDeserializer(valueType)
        ));
        factory.setConcurrency(Math.max(1, concurrency == null ? 1 : concurrency));
        factory.getContainerProperties().setPollTimeout(Math.max(100L, pollTimeout == null ? 1000L : pollTimeout));
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.RECORD);
        return factory;
    }

    private Map<String, Object> producerProperties(String bootstrapServers) {
        Map<String, Object> properties = new HashMap<>();
        properties.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        properties.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        properties.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        properties.put(ProducerConfig.ACKS_CONFIG, "all");
        properties.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        properties.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);
        properties.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 120_000);
        properties.put(JsonSerializer.ADD_TYPE_INFO_HEADERS, false);
        return properties;
    }

    private Map<String, Object> consumerProperties(String bootstrapServers,
                                                   String groupId,
                                                   String autoOffsetReset,
                                                   Integer maxPollRecords,
                                                   Class<?> valueType) {
        Map<String, Object> properties = new HashMap<>();
        properties.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        properties.put(ConsumerConfig.GROUP_ID_CONFIG, groupId);
        properties.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, autoOffsetReset);
        properties.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        properties.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, maxPollRecords);
        return properties;
    }

    private Map<String, Object> stringConsumerProperties(String bootstrapServers,
                                                         String configuredGroupId,
                                                         String autoOffsetReset,
                                                         Integer maxPollRecords) {
        Map<String, Object> properties = new HashMap<>();
        properties.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        properties.put(ConsumerConfig.GROUP_ID_CONFIG, resolveAuthorizationGroupId(configuredGroupId));
        properties.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, autoOffsetReset);
        properties.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        properties.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, maxPollRecords);
        return properties;
    }

    private <T> JsonDeserializer<T> jsonDeserializer(Class<T> valueType) {
        JsonDeserializer<T> valueDeserializer = new JsonDeserializer<>(valueType, false);
        valueDeserializer.addTrustedPackages("com.im.dto", "com.im.enums");
        return valueDeserializer;
    }

    private String resolveAuthorizationGroupId(String configuredGroupId) {
        if (StringUtils.hasText(configuredGroupId)) {
            return configuredGroupId.trim();
        }
        return "im-ws-authz-cache-" + UUID.randomUUID();
    }

    private String normalizeRoutingMode(String routingMode) {
        if (!StringUtils.hasText(routingMode)) {
            return ROUTING_MODE_INSTANCE;
        }
        return routingMode.trim().toLowerCase();
    }

    private String sanitizeInstanceId(String instanceId) {
        if (!StringUtils.hasText(instanceId)) {
            return "unknown";
        }
        return instanceId.trim().replaceAll("[^A-Za-z0-9._-]", "_");
    }
}
