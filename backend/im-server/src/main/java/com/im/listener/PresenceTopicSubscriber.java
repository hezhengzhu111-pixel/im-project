package com.im.listener;

import com.im.config.ImNodeIdentity;
import com.im.dto.PresenceEvent;
import com.im.enums.UserStatus;
import com.im.service.IImService;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class PresenceTopicSubscriber {

    private final RedissonClient redissonClient;
    private final IImService imService;
    private final ImNodeIdentity nodeIdentity;

    @Value("${im.ws.presence-channel:im:presence:broadcast}")
    private String presenceChannel;

    private volatile Integer listenerId;
    private volatile RTopic topic;

    @PostConstruct
    public void subscribe() {
        topic = redissonClient.getTopic(presenceChannel);
        listenerId = topic.addListener(PresenceEvent.class, this::handlePresenceEvent);
        log.info("Subscribed Redisson topic for websocket presence. channel={}, listenerId={}",
                presenceChannel, listenerId);
    }

    private void handlePresenceEvent(CharSequence channel, PresenceEvent event) {
        try {
            if (event == null || StringUtils.isBlank(event.getUserId()) || StringUtils.isBlank(event.getStatus())) {
                log.debug("Ignore invalid presence event. channel={}", channel);
                return;
            }
            if (StringUtils.equals(event.getSourceInstanceId(), nodeIdentity.getInstanceId())) {
                return;
            }
            UserStatus status = UserStatus.valueOf(event.getStatus().trim().toUpperCase());
            imService.broadcastOnlineStatus(event.getUserId(), status, event.getLastSeen());
        } catch (IllegalArgumentException e) {
            log.warn("Ignore presence event with invalid status. channel={}, status={}, sourceInstanceId={}",
                    channel, event == null ? null : event.getStatus(),
                    event == null ? null : event.getSourceInstanceId());
        } catch (Exception e) {
            log.warn("Handle presence event failed. channel={}, sourceInstanceId={}, error={}",
                    channel, event == null ? null : event.getSourceInstanceId(), e.getMessage());
        }
    }

    @PreDestroy
    public void unsubscribe() {
        if (topic != null && listenerId != null) {
            topic.removeListener(listenerId);
        }
        listenerId = null;
        topic = null;
    }
}
