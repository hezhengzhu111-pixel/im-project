package com.im.config;

import com.im.listener.WsPushRedisSubscriber;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

@Configuration
public class RedisPubSubConfig {

    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(
            RedisConnectionFactory connectionFactory,
            WsPushRedisSubscriber subscriber,
            @Value("${im.ws.channel-prefix:im:ws:push:}") String channelPrefix,
            @Value("${im.instance-id:${HOSTNAME:${spring.application.name:im-server}}}") String instanceId) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(subscriber, new ChannelTopic(channelPrefix + instanceId));
        return container;
    }
}
