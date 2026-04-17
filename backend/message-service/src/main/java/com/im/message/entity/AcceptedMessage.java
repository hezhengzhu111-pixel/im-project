package com.im.message.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.im.persistence.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("accepted_message")
public class AcceptedMessage extends BaseEntity {

    @TableField("sender_id")
    private Long senderId;

    @TableField("client_message_id")
    private String clientMessageId;

    @TableField("conversation_id")
    private String conversationId;

    @TableField("ack_stage")
    private String ackStage;

    @TableField("payload_json")
    private String payloadJson;
}
