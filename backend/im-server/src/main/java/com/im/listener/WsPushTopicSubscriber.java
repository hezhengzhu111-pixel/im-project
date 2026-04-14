package com.im.listener;

import com.im.config.ImNodeIdentity;
import com.im.dto.WsPushEvent;
import com.im.metrics.ImServerMetrics;
import com.im.service.WsPushEventDispatcher;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

@Slf4j
@Component
@RequiredArgsConstructor
public class WsPushTopicSubscriber {

    private final RedissonClient redissonClient;
    private final WsPushEventDispatcher dispatcher;
    private final ImNodeIdentity nodeIdentity;
    @Qualifier("imServerExecutor")
    private final Executor imServerExecutor;

    @Autowired(required = false)
    private ImServerMetrics metrics;

    @Value("${im.ws.channel-prefix:im:channel:}")
    private String channelPrefix;

    private volatile Integer listenerId;
    private volatile RTopic topic;

    @PostConstruct
    public void subscribe() {
        String channelName = channelPrefix + nodeIdentity.getInstanceId();
        topic = redissonClient.getTopic(channelName);
        listenerId = topic.addListener(WsPushEvent.class, this::submitDispatchTask);
        log.info("Subscribed Redisson topic for websocket push. channel={}, listenerId={}", channelName, listenerId);
    }

    private void submitDispatchTask(CharSequence channel, WsPushEvent message) {
        try {
            imServerExecutor.execute(() -> dispatchSafely(channel, message));
            recordSubmitSuccess();
        } catch (RejectedExecutionException e) {
            recordSubmitFailure("executor_rejected");
            log.warn("Submit ws push event dispatch failed. channel={}, eventId={}, reason={}, error={}",
                    channel, resolveEventId(message), "executor_rejected", e.getMessage());
        } catch (RuntimeException e) {
            recordSubmitFailure("submit_failed");
            log.warn("Submit ws push event dispatch failed. channel={}, eventId={}, reason={}, error={}",
                    channel, resolveEventId(message), "submit_failed", e.getMessage());
        }
    }

    private void dispatchSafely(CharSequence channel, WsPushEvent message) {
        try {
            dispatcher.dispatchEvent(message);
        } catch (Exception e) {
            recordSubmitFailure("dispatch_failed");
            log.warn("Consume ws push event failed. channel={}, eventId={}, error={}",
                    channel, resolveEventId(message), e.getMessage());
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

    public boolean isSubscribed() {
        return topic != null && listenerId != null && listenerId > 0;
    }

    private String resolveEventId(WsPushEvent message) {
        return message == null ? null : message.getEventId();
    }

    private void recordSubmitFailure(String reason) {
        if (metrics != null) {
            metrics.recordListenerSubmit(false, reason);
        }
    }

    private void recordSubmitSuccess() {
        if (metrics != null) {
            metrics.recordListenerSubmit(true, "accepted");
        }
    }
}
