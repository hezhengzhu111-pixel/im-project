package com.im.service;

import com.im.dto.MessageDTO;
import com.im.enums.MessageType;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MessageRetryQueueTest {

    @Test
    void shouldEnqueueAndPollReady() {
        MessageRetryQueue queue = new MessageRetryQueue();
        MessageDTO dto = MessageDTO.builder()
                .id(1L)
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .content("hi")
                .build();

        queue.enqueue("2", dto, "fail");
        MessageRetryQueue.RetryItem item = queue.pollReady("2");

        assertThat(item).isNotNull();
        assertThat(item.getMessage().getId()).isEqualTo(1L);
        assertThat(queue.pollReady("2")).isNull();
    }

    @Test
    void requeueShouldApplyBackoff() {
        MessageRetryQueue queue = new MessageRetryQueue();
        MessageRetryQueue.RetryItem item = new MessageRetryQueue.RetryItem();
        item.setUserId("1");
        item.setAttempts(0);
        item.setNextRetryAtMs(System.currentTimeMillis());

        queue.requeue(item, "err");

        MessageRetryQueue.RetryItem polled = queue.pollReady("1");
        assertThat(polled).isNull();
    }
}

