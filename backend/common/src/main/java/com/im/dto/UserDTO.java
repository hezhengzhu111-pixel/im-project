package com.im.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Builder;
import lombok.ToString;

import com.im.validation.group.RegisterGroup;
import com.im.validation.group.UpdateGroup;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 用户DTO
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class UserDTO implements Serializable {
    private String id;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @ToString.Exclude
    @NotBlank(message = "密码不能为空", groups = RegisterGroup.class)
    @Size(min = 6, max = 64, message = "密码长度需在6-64位", groups = RegisterGroup.class)
    private String password;

    @NotBlank(message = "用户名不能为空", groups = RegisterGroup.class)
    @Size(min = 3, max = 32, message = "用户名长度需在3-32位", groups = RegisterGroup.class)
    private String username;

    @Size(max = 32, message = "昵称长度不能超过32位", groups = {RegisterGroup.class, UpdateGroup.class})
    private String nickname;

    @Size(max = 255, message = "头像地址过长", groups = {RegisterGroup.class, UpdateGroup.class})
    private String avatar;

    @Email(message = "邮箱格式不正确", groups = {RegisterGroup.class, UpdateGroup.class})
    @Size(max = 128, message = "邮箱长度不能超过128位", groups = {RegisterGroup.class, UpdateGroup.class})
    private String email;

    @Pattern(regexp = "^$|^\\+?[0-9\\-]{6,20}$", message = "手机号格式不正确", groups = {RegisterGroup.class, UpdateGroup.class})
    private String phone;
    private Integer status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private LocalDateTime lastLoginTime;
}
