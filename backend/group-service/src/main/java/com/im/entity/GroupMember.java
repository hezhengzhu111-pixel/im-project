package com.im.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@TableName("im_group_member")
@Data
@EqualsAndHashCode(callSuper = true)
public class GroupMember extends BaseEntity {
    
    @TableField("group_id")
    private Long groupId;
    
    @TableField("user_id")
    private Long userId;
    
    @TableField("nickname")
    private String nickname; // 群内昵称
    
    @TableField("role")
    private Integer role = 1; // 1:普通成员 2:管理员 3:群主
    
    @TableField("status")
    private Boolean status = true; // 1:正常 0:已退出
    
    @TableField("join_time")
    private LocalDateTime joinTime;

    public static class UniqueConstraint {}
}
