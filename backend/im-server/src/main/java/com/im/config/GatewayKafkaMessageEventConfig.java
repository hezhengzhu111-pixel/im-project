package com.im.config;

import com.im.dto.MessageEvent;
import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.support.serializer.JsonDeserializer;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Configuration
public class GatewayKafkaMessageEventConfig {

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
                configuredGroupId,
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
                configuredGroupId,
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
                configuredGroupId,
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

    private <T> ConcurrentKafkaListenerContainerFactory<String, T> singleRecordFactory(
            String bootstrapServers,
            String configuredGroupId,
            String autoOffsetReset,
            Integer maxPollRecords,
            Integer concurrency,
            Long pollTimeout,
            Class<T> valueType) {
        ConcurrentKafkaListenerContainerFactory<String, T> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(new DefaultKafkaConsumerFactory<>(
                consumerProperties(bootstrapServers, configuredGroupId, autoOffsetReset, maxPollRecords, valueType),
                new StringDeserializer(),
                jsonDeserializer(valueType)
        ));
        factory.setConcurrency(Math.max(1, concurrency == null ? 1 : concurrency));
        factory.getContainerProperties().setPollTimeout(Math.max(100L, pollTimeout == null ? 1000L : pollTimeout));
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.RECORD);
        return factory;
    }

    private Map<String, Object> consumerProperties(String bootstrapServers,
                                                   String configuredGroupId,
                                                   String autoOffsetReset,
                                                   Integer maxPollRecords,
                                                   Class<?> valueType) {
        Map<String, Object> properties = new HashMap<>();
        properties.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        properties.put(ConsumerConfig.GROUP_ID_CONFIG, resolveGroupId(configuredGroupId));
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

    private String resolveGroupId(String configuredGroupId) {
        if (StringUtils.hasText(configuredGroupId)) {
            return configuredGroupId.trim();
        }
        return "im-ws-pusher-" + UUID.randomUUID();
    }

    private String resolveAuthorizationGroupId(String configuredGroupId) {
        if (StringUtils.hasText(configuredGroupId)) {
            return configuredGroupId.trim();
        }
        return "im-ws-authz-cache-" + UUID.randomUUID();
    }
}
