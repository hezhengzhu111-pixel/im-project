package com.im.config;

import com.im.dto.MessageEvent;
import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
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

import java.util.HashMap;
import java.util.Map;

@Configuration
public class KafkaMessageEventConfig {

    @Bean
    public KafkaTemplate<String, MessageEvent> messageEventKafkaTemplate(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers) {
        return new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(producerProperties(bootstrapServers)));
    }

    @Bean
    public KafkaTemplate<String, ReadEvent> readEventKafkaTemplate(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers) {
        return new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(producerProperties(bootstrapServers)));
    }

    @Bean
    public KafkaTemplate<String, StatusChangeEvent> statusChangeEventKafkaTemplate(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers) {
        return new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(producerProperties(bootstrapServers)));
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, MessageEvent> messageEventBatchKafkaListenerContainerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${spring.kafka.consumer.auto-offset-reset:earliest}") String autoOffsetReset,
            @Value("${spring.kafka.consumer.max-poll-records:500}") Integer maxPollRecords) {
        ConcurrentKafkaListenerContainerFactory<String, MessageEvent> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(new DefaultKafkaConsumerFactory<>(
                consumerProperties(bootstrapServers, autoOffsetReset, maxPollRecords, MessageEvent.class),
                new StringDeserializer(),
                jsonDeserializer(MessageEvent.class)
        ));
        factory.setBatchListener(true);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.BATCH);
        return factory;
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, ReadEvent> readEventKafkaListenerContainerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${spring.kafka.consumer.auto-offset-reset:earliest}") String autoOffsetReset,
            @Value("${spring.kafka.consumer.max-poll-records:500}") Integer maxPollRecords) {
        return singleRecordFactory(bootstrapServers, autoOffsetReset, maxPollRecords, ReadEvent.class);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, StatusChangeEvent> statusChangeEventKafkaListenerContainerFactory(
            @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String bootstrapServers,
            @Value("${spring.kafka.consumer.auto-offset-reset:earliest}") String autoOffsetReset,
            @Value("${spring.kafka.consumer.max-poll-records:500}") Integer maxPollRecords) {
        return singleRecordFactory(bootstrapServers, autoOffsetReset, maxPollRecords, StatusChangeEvent.class);
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

    private <T> ConcurrentKafkaListenerContainerFactory<String, T> singleRecordFactory(
            String bootstrapServers,
            String autoOffsetReset,
            Integer maxPollRecords,
            Class<T> valueType) {
        ConcurrentKafkaListenerContainerFactory<String, T> factory = new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(new DefaultKafkaConsumerFactory<>(
                consumerProperties(bootstrapServers, autoOffsetReset, maxPollRecords, valueType),
                new StringDeserializer(),
                jsonDeserializer(valueType)
        ));
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.RECORD);
        return factory;
    }

    private Map<String, Object> consumerProperties(String bootstrapServers,
                                                   String autoOffsetReset,
                                                   Integer maxPollRecords,
                                                   Class<?> valueType) {
        Map<String, Object> properties = new HashMap<>();
        properties.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        properties.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, autoOffsetReset);
        properties.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        properties.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, maxPollRecords);
        properties.put(JsonDeserializer.TRUSTED_PACKAGES, "com.im.dto,com.im.enums");
        properties.put(JsonDeserializer.VALUE_DEFAULT_TYPE, valueType.getName());
        properties.put(JsonDeserializer.USE_TYPE_INFO_HEADERS, false);
        return properties;
    }

    private <T> JsonDeserializer<T> jsonDeserializer(Class<T> valueType) {
        JsonDeserializer<T> valueDeserializer = new JsonDeserializer<>(valueType, false);
        valueDeserializer.addTrustedPackages("com.im.dto", "com.im.enums");
        return valueDeserializer;
    }
}
