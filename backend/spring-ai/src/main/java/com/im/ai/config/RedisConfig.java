package com.im.ai.config;

import com.im.ai.task.TaskConsumer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.stream.StreamMessageListenerContainer;

import java.time.Duration;

@Configuration
public class RedisConfig {

    private static final String TASK_STREAM_KEY = "im:ai:tasks";
    private static final String CONSUMER_GROUP = "im-spring-ai-workers";
    private static final String CONSUMER_NAME = "worker-1";

    @Bean
    public StreamMessageListenerContainer<String, ?> streamContainer(
            RedisConnectionFactory connectionFactory,
            TaskConsumer listener) {

        try {
            var template = new StringRedisTemplate(connectionFactory);
            template.opsForStream().createGroup(TASK_STREAM_KEY, ReadOffset.from("0-0"), CONSUMER_GROUP);
        } catch (Exception e) {
            // Group already exists, ignore
        }

        var options = StreamMessageListenerContainer.StreamMessageListenerContainerOptions
                .builder()
                .pollTimeout(Duration.ofSeconds(5))
                .targetType(String.class)
                .build();

        var container = StreamMessageListenerContainer.create(connectionFactory, options);

        var offset = Consumer.from(CONSUMER_GROUP, CONSUMER_NAME);
        var streamOffset = StreamOffset.create(TASK_STREAM_KEY, ReadOffset.lastConsumed());

        container.register(ContainerBuilder.defaultHandler(offset, streamOffset, listener));
        container.start();

        return container;
    }
}

// Helper class for the container builder pattern
class ContainerBuilder {
    static StreamMessageListenerContainer.StreamReadRequest<String> defaultHandler(
            Consumer consumer,
            StreamOffset<String> offset,
            TaskConsumer listener) {
        return StreamMessageListenerContainer.StreamReadRequest.builder(offset)
                .consumer(consumer)
                .autoAcknowledge(true)
                .build();
    }
}
