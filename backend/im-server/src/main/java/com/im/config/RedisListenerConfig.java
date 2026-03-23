package com.im.config;

import com.im.listener.RedisMessageListener;
import com.im.service.impl.ImServiceImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

@Configuration
@RequiredArgsConstructor
public class RedisListenerConfig {

    private final ImServiceImpl imService;
    private final RedisMessageListener redisMessageListener;

    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(RedisConnectionFactory connectionFactory) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        
        // 订阅当前实例专属的 Channel
        String channelName = "im:msg:channel:" + imService.getInstanceId();
        container.addMessageListener(redisMessageListener, new ChannelTopic(channelName));
        
        return container;
    }
}
