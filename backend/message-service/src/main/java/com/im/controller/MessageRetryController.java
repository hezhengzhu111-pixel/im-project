package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.entity.MessageOutboxEvent;
import com.im.mapper.MessageOutboxMapper;
import com.im.service.OutboxService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/s/retry")
@RequiredArgsConstructor
public class MessageRetryController {

    private final MessageOutboxMapper outboxMapper;
    private final OutboxService outboxService;
    @Value("${im.kafka.topic.private-message:im-private-message-topic}")
    private String privateMessageTopic = "im-private-message-topic";
    @Value("${im.kafka.topic.group-message:im-group-message-topic}")
    private String groupMessageTopic = "im-group-message-topic";

    @PostMapping("/private/{messageId}")
    public ApiResponse<Void> retryPrivate(@PathVariable("messageId") Long messageId) {
        return retryByTopic(messageId, privateMessageTopic);
    }

    @PostMapping("/group/{messageId}")
    public ApiResponse<Void> retryGroup(@PathVariable("messageId") Long messageId) {
        return retryByTopic(messageId, groupMessageTopic);
    }

    private ApiResponse<Void> retryByTopic(Long messageId, String topic) {
        if (messageId == null || messageId <= 0) {
            return ApiResponse.badRequest("messageId不能为空");
        }
        try {
            MessageOutboxEvent latest = outboxMapper.selectLatestByRelatedMessageIdAndTopic(messageId, topic);
            if (latest == null) {
                return ApiResponse.notFound("未找到可重投的消息事件");
            }
            outboxService.enqueueAfterCommit(latest.getTopic(), latest.getMessageKey(), latest.getPayload(), messageId);
            return ApiResponse.success("已触发重投", null);
        } catch (IllegalArgumentException e) {
            return ApiResponse.badRequest(e.getMessage());
        } catch (SecurityException e) {
            return ApiResponse.forbidden(e.getMessage());
        } catch (Exception e) {
            return ApiResponse.error("系统异常，请联系管理员");
        }
    }
}
