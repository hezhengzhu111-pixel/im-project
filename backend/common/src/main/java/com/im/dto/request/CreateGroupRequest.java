package com.im.dto.request;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

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
    String name;
    /**
     * 群类型
     */
    Integer type;
    /**
     * 群公告
     */
    @Size(max = 500, message = "群公告不能超过500个字符")
    String announcement;
}
