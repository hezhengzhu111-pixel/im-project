package com.im.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class AuthIntrospectResultDTO {
    private boolean valid;
    private boolean expired;
    private String error;
    private Long userId;
    private String username;
    private Long issuedAtEpochMs;
    private Long expiresAtEpochMs;
    private String jti;
    private Map<String, Object> userInfo;
    private List<String> resourcePermissions;
    private Map<String, Object> dataScopes;
}
