package com.im.user.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@TableName("friend_request")
@Data
public class FriendRequest {
    @TableId(value = "id", type = IdType.ASSIGN_ID)
    private Long id;
    
    @TableField("applicant_id")
    private Long applicantId;
    
    @TableField("target_user_id")
    private Long targetUserId;  // 但实体属性名应该是targetUserId
    
    @TableField("status")
    private Integer status; // 0: 待处理, 1: 已同意, 2: 已拒绝
    
    @TableField("apply_time")
    private LocalDateTime applyTime;
    
    @TableField("apply_reason")
    private String applyReason; // 申请理由
    
    @TableField("reject_reason")
    private String rejectReason; // 拒绝理由
    
    @TableField("handle_time")
    private LocalDateTime handleTime; // 处理时间
    
}
