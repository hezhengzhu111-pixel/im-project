package com.im.dto;

import lombok.Data;

@Data
public class TokenParseResultDTO {
    private boolean valid;
    private boolean expired;
    private String error;
    private Long userId;
    private String username;
    private Long issuedAtEpochMs;
    private Long expiresAtEpochMs;
    private String jti;
    private String tokenType;
}

