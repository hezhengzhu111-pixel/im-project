package com.im.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class SendCodeRequest {
    @NotBlank(message = "目标(手机号/邮箱)不能为空")
    private String target;
}