package com.im.group.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.im.persistence.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@TableName("im_group")
@Data
@EqualsAndHashCode(callSuper = true)
public class Group extends BaseEntity {
    
    @TableField("name")
    private String name;
    
    @TableField("avatar")
    private String avatar;
    
    @TableField("announcement")
    private String announcement; // 群公告
    
    @TableField("owner_id")
    private Long ownerId; // 群主ID
    
    @TableField("type")
    private Integer type = 1; // 1:普通群 2:公开群
    
    @TableField("max_members")
    private Integer maxMembers = 500; // 最大成员数
    
    @TableField("member_count")
    private Integer memberCount = 1; // 当前成员数
    
    @TableField("status")
    private Boolean status = true; // 1:正常 0:已解散
    
}
