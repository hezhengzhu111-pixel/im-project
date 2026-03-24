package com.im.dto.request;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * 获取群成员列表请求
 */
@Data
public class GetGroupMembersRequest {
    
    @NotNull(message = "群组ID不能为空")
    private Long groupId;
    
    private Long cursor;
    
    @Positive(message = "每页数量必须大于0")
    private Integer limit = 20;
}
