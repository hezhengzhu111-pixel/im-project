package com.im.dto.request;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;

@Data
public class RefreshTokenRequest {
    private String accessToken;

    @NotBlank
    private String refreshToken;
}

