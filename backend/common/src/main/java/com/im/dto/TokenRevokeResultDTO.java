package com.im.dto;

import lombok.Data;

@Data
public class TokenRevokeResultDTO {
    private boolean success;
    private String message;
    private Long userId;
    private String tokenType;
}
