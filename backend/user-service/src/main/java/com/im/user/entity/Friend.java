package com.im.user.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.im.persistence.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("im_friend")
@Data
@EqualsAndHashCode(callSuper = true)
public class Friend extends BaseEntity {
    
    @TableField("user_id")
    private Long userId;
    
    @TableField("friend_id")
    private Long friendId;
    
    @TableField("remark")
    private String remark; // 备注名
    
    @TableField("status")
    private Integer status = 1; // 1:正常 2:已删除 3:已拉黑
    
    public static class UniqueConstraint {}
}
