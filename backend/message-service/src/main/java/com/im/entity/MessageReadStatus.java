package com.im.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 消息已读状态实体类（主要用于群聊消息已读状态跟踪）
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("message_read_status")
public class MessageReadStatus {
    
    @TableId(value = "id", type = IdType.ASSIGN_ID)
    private Long id;
    
    /**
     * 消息ID
     */
    @TableField("message_id")
    private Long messageId;
    
    /**
     * 用户ID
     */
    @TableField("user_id")
    private Long userId;
    
    /**
     * 已读时间
     */
    @TableField("read_at")
    private LocalDateTime readAt;
}
