package com.im.dto.request;

import lombok.Data;

@Data
public class RevokeTokenRequest {
    private String token;
    private String reason;
}
