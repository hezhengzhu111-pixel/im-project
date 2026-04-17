package com.im.message.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.im.persistence.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("message_outbox")
public class MessageOutbox extends BaseEntity {

    @TableField("sender_id")
    private Long senderId;

    @TableField("client_message_id")
    private String clientMessageId;

    @TableField("conversation_id")
    private String conversationId;

    @TableField("topic")
    private String topic;

    @TableField("routing_key")
    private String routingKey;

    @TableField("event_json")
    private String eventJson;

    @TableField("dispatch_status")
    private String dispatchStatus;

    @TableField("attempt_count")
    private Integer attemptCount;

    @TableField("next_attempt_time")
    private LocalDateTime nextAttemptTime;

    @TableField("last_error")
    private String lastError;

    @TableField("dispatched_time")
    private LocalDateTime dispatchedTime;
}
