package com.im.message.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.im.persistence.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("message_state_outbox")
public class MessageStateOutbox extends BaseEntity {

    @TableField("idempotency_key")
    private String idempotencyKey;

    @TableField("event_type")
    private String eventType;

    @TableField("topic")
    private String topic;

    @TableField("routing_key")
    private String routingKey;

    @TableField("payload_json")
    private String payloadJson;

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
