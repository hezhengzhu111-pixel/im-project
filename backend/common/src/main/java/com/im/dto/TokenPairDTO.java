package com.im.dto;

import lombok.Builder;
import lombok.Data;

@Data
public class TokenPairDTO {
    private String accessToken;
    private String refreshToken;
    private Long expiresInMs;
    private Long refreshExpiresInMs;
}

