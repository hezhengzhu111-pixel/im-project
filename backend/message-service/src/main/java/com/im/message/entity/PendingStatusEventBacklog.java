package com.im.message.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.im.persistence.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("pending_status_event")
public class PendingStatusEventBacklog extends BaseEntity {

    @TableField("message_id")
    private Long messageId;

    @TableField("new_status")
    private Integer newStatus;

    @TableField("changed_at")
    private LocalDateTime changedAt;

    @TableField("payload_json")
    private String payloadJson;
}
