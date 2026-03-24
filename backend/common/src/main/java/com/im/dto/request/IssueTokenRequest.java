package com.im.dto.request;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@Data
public class IssueTokenRequest {
    @NotNull
    private Long userId;

    @NotBlank
    private String username;

    private String nickname;
    private String avatar;
    private String email;
    private String phone;
}

