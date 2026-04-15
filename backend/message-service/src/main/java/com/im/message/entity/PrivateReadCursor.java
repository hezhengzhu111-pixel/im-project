package com.im.message.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.im.persistence.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("private_read_cursor")
public class PrivateReadCursor extends BaseEntity {

    @TableField("user_id")
    private Long userId;

    @TableField("peer_user_id")
    private Long peerUserId;

    @TableField("last_read_at")
    private LocalDateTime lastReadAt;
}
