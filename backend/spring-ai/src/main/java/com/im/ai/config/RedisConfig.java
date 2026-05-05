package com.im.ai.config;

import com.im.ai.task.TaskConsumer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
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
    public StreamMessageListenerContainer<String, MapRecord<String, String, String>> streamContainer(
            RedisConnectionFactory connectionFactory,
            TaskConsumer listener) {

        try {
            var template = new StringRedisTemplate(connectionFactory);
            template.afterPropertiesSet();
            template.opsForStream()
                    .createGroup(TASK_STREAM_KEY, ReadOffset.from("0-0"), CONSUMER_GROUP);
        } catch (Exception e) {
            // Group already exists, ignore silently
        }

        var options = StreamMessageListenerContainer
                .StreamMessageListenerContainerOptions
                .builder()
                .pollTimeout(Duration.ofSeconds(5))
                .serializer(new org.springframework.data.redis.serializer.StringRedisSerializer())
                .build();

        var container = StreamMessageListenerContainer
                .<String, MapRecord<String, String, String>>create(connectionFactory, options);

        var request = StreamMessageListenerContainer.StreamReadRequest
                .builder(StreamOffset.create(TASK_STREAM_KEY, ReadOffset.lastConsumed()))
                .consumer(Consumer.from(CONSUMER_GROUP, CONSUMER_NAME))
                .autoAcknowledge(true)
                .cancelOnError(err -> false)
                .build();

        container.register(request, listener);
        container.start();

        return container;
    }
}
