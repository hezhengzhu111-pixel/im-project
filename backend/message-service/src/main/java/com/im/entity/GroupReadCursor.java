package com.im.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("group_read_cursor")
public class GroupReadCursor extends BaseEntity {

    @TableField("group_id")
    private Long groupId;

    @TableField("user_id")
    private Long userId;

    @TableField("last_read_at")
    private LocalDateTime lastReadAt;
}
