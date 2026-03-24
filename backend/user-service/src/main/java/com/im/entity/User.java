package com.im.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@TableName("users")
@Data
@EqualsAndHashCode(callSuper = true)
public class User extends BaseEntity {
    
    @TableField("username")
    private String username;
    
    @TableField("password")
    private String password;
    
    @TableField("nickname")
    private String nickname;
    
    @TableField("avatar")
    private String avatar;
    
    @TableField("phone")
    private String phone;
    
    @TableField("email")
    private String email;
    
    @TableField("status")
    private Integer status = 1; // 1:正常 0:禁用
    
    @TableField("last_login_time")
    private LocalDateTime lastLoginTime;
    
    @TableField("im_token")
    private String imToken; // IM服务商返回的token
    
    @TableField("im_server_url")
    private String imServerUrl; // IM服务器地址
}
