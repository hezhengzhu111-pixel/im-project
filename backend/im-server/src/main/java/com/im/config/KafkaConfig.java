package com.im.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.kafka.ConcurrentKafkaListenerContainerFactoryConfigurer;
import org.springframework.boot.autoconfigure.kafka.KafkaProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;

import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.core.ConsumerFactory;

@Configuration
public class KafkaConfig {

    private final KafkaProperties kafkaProperties;

    public KafkaConfig(KafkaProperties kafkaProperties) {
        this.kafkaProperties = kafkaProperties;
    }

    @Value("${im.kafka.consumer.concurrency:3}")
    private int concurrency;

    @Value("${im.kafka.consumer.poll-timeout:1000}")
    private long pollTimeoutMs;

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String> kafkaListenerContainerFactory(
            ConcurrentKafkaListenerContainerFactoryConfigurer configurer,
            ConsumerFactory<String, String> consumerFactory) {
        ConcurrentKafkaListenerContainerFactory<String, String> factory = new ConcurrentKafkaListenerContainerFactory<>();
        @SuppressWarnings({"rawtypes", "unchecked"})
        ConcurrentKafkaListenerContainerFactory rawFactory = factory;
        @SuppressWarnings({"rawtypes", "unchecked"})
        ConsumerFactory rawConsumerFactory = consumerFactory;
        configurer.configure(rawFactory, rawConsumerFactory);
        factory.setConcurrency(Math.max(1, concurrency));
        factory.getContainerProperties().setPollTimeout(Math.max(0, pollTimeoutMs));
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        factory.getContainerProperties().setObservationEnabled(kafkaProperties.getListener().isObservationEnabled());
        return factory;
    }
}
