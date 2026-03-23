package com.im.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@TableName("user_settings")
@Data
public class UserSettings {

    @TableId("user_id")
    private Long userId;

    @TableField("privacy_settings")
    private String privacySettings; // JSON string

    @TableField("message_settings")
    private String messageSettings; // JSON string

    @TableField("general_settings")
    private String generalSettings; // JSON string

    @TableField(value = "created_time", fill = FieldFill.INSERT)
    private LocalDateTime createdTime;

    @TableField(value = "updated_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedTime;
}