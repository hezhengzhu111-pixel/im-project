package com.im.listener;

import com.im.config.ImNodeIdentity;
import com.im.dto.WsPushEvent;
import com.im.service.WsPushEventDispatcher;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class WsPushTopicSubscriber {

    private final RedissonClient redissonClient;
    private final WsPushEventDispatcher dispatcher;
    private final ImNodeIdentity nodeIdentity;

    @Value("${im.ws.channel-prefix:im:channel:}")
    private String channelPrefix;

    private volatile Integer listenerId;
    private volatile RTopic topic;

    @PostConstruct
    public void subscribe() {
        String channelName = channelPrefix + nodeIdentity.getInstanceId();
        topic = redissonClient.getTopic(channelName);
        listenerId = topic.addListener(WsPushEvent.class, (channel, message) -> {
            try {
                dispatcher.dispatchEvent(message);
            } catch (Exception e) {
                log.error("Consume ws push event failed. channel={}, eventId={}",
                        channel, message == null ? null : message.getEventId(), e);
                throw e;
            }
        });
        log.info("Subscribed Redisson topic for websocket push. channel={}, listenerId={}", channelName, listenerId);
    }

    @PreDestroy
    public void unsubscribe() {
        if (topic != null && listenerId != null) {
            topic.removeListener(listenerId);
        }
        listenerId = null;
        topic = null;
    }

    public boolean isSubscribed() {
        return topic != null && listenerId != null && listenerId > 0;
    }
}
