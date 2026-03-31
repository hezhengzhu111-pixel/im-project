package com.im.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 创建群组请求DTO
 */
@Data
public class CreateGroupRequest {
    /**
     * 群主ID
     */
    Long ownerId;
    /**
     * 群名称
     */
    @NotBlank(message = "群名称不能为空")
    String name;
    /**
     * 群类型
     */
    @NotNull(message = "群类型不能为空")
    Integer type;
    /**
     * 群公告
     */
    @Size(max = 500, message = "群公告不能超过500个字符")
    String announcement;

    /**
     * 群头像
     */
    @Size(max = 500, message = "群头像地址不能超过500个字符")
    String avatar;
}
